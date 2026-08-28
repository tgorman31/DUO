import { and, eq, inArray } from "drizzle-orm";
import type { TrainingDb } from "@/db/seed";
import { athleteExerciseSettings, catalogueExercises, exercisePerformances, exercises, progressionStates, strengthFocusSlots, strengthSets, strengthSlots } from "@/db/schema";
import { calculateProgression } from "@/lib/training-logic";

type Entry = { slotId?: unknown; exerciseId?: unknown; note?: unknown; sets?: unknown };
const text = (value: unknown) => typeof value === "string" ? value : value == null ? "" : String(value);
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Validates every strength entry first, then replaces the result atomically in logical order. */
export async function completeStrengthEntries(db: TrainingDb, input: { resultId: string; athleteId: string; completedDate: string; entries: Entry[]; validateOnly?: boolean }) {
  if (!input.entries.length) throw new Error("Log at least one strength exercise.");
  const resolved: Array<{ slot: typeof strengthSlots.$inferSelect; historySlotId: string; exercise: typeof exercises.$inferSelect; historyExerciseId: string; note: string; parsedSets: Array<{ setNumber: number; weightKg: number; reps: number }>; }> = [];

  // No writes occur in this phase. A failure here leaves any prior result untouched.
  for (const rawEntry of input.entries) {
    if (!rawEntry || typeof rawEntry !== "object") throw new Error("Each strength entry needs a slot, exercise, and at least one completed set.");
    const slotId = text(rawEntry.slotId); const exerciseId = text(rawEntry.exerciseId);
    const rawSets = Array.isArray(rawEntry.sets) ? rawEntry.sets : [];
    const parsedSets = rawSets.map((raw, index) => { const set = (raw ?? {}) as Record<string, unknown>; return { setNumber: index + 1, weightKg: number(set.weightKg), reps: Math.max(0, Math.round(number(set.reps))) }; }).filter((set) => set.weightKg >= 0 && set.reps > 0);
    if (!slotId || !exerciseId || !parsedSets.length) throw new Error("Each strength entry needs a slot, exercise, and at least one completed set.");
    let historySlotId = slotId;
    let slot: typeof strengthSlots.$inferSelect | undefined = await db.select().from(strengthSlots).where(eq(strengthSlots.id, slotId)).limit(1).then((rows) => rows[0]);
    if (!slot) {
      const focusSlot = await db.select().from(strengthFocusSlots).where(eq(strengthFocusSlots.id, slotId)).limit(1).then((rows) => rows[0]);
      historySlotId = focusSlot?.historySlotId ?? "";
      slot = historySlotId ? await db.select().from(strengthSlots).where(eq(strengthSlots.id, historySlotId)).limit(1).then((rows) => rows[0]) : undefined;
    }
    if (!slot || !historySlotId) throw new Error(`Unknown strength slot: ${slotId}. Refresh the workout and try again.`);
    let historyExerciseId = exerciseId;
    let exercise: typeof exercises.$inferSelect | undefined = await db.select().from(exercises).where(eq(exercises.id, exerciseId)).limit(1).then((rows) => rows[0]);
    if (!exercise) {
      const catalogue = await db.select().from(catalogueExercises).where(eq(catalogueExercises.id, exerciseId)).limit(1).then((rows) => rows[0]);
      historyExerciseId = catalogue?.legacyExerciseId ?? (catalogue ? `catalogue-${catalogue.id}` : exerciseId);
      exercise = historyExerciseId ? await db.select().from(exercises).where(eq(exercises.id, historyExerciseId)).limit(1).then((rows) => rows[0]) : undefined;
    }
    if (!exercise) throw new Error(`Unknown strength exercise: ${exerciseId}. Refresh the workout and try again.`);
    resolved.push({ slot: slot!, historySlotId, exercise: exercise!, historyExerciseId, note: text(rawEntry.note), parsedSets });
  }

  if (input.validateOnly) return { progressionMessages: [], validatedEntries: resolved };
  const old = await db.select({ id: exercisePerformances.id }).from(exercisePerformances).where(eq(exercisePerformances.resultId, input.resultId));
  if (old.length) {
    await db.delete(strengthSets).where(inArray(strengthSets.performanceId, old.map((row) => row.id)));
    await db.delete(exercisePerformances).where(eq(exercisePerformances.resultId, input.resultId));
  }
  const progressionMessages: string[] = [];
  for (const entry of resolved) {
    const [state, setting] = await Promise.all([
      db.select().from(progressionStates).where(and(eq(progressionStates.athleteId, input.athleteId), eq(progressionStates.exerciseId, entry.historyExerciseId))).limit(1).then((rows) => rows[0]),
      db.select().from(athleteExerciseSettings).where(and(eq(athleteExerciseSettings.athleteId, input.athleteId), eq(athleteExerciseSettings.exerciseId, entry.historyExerciseId))).limit(1).then((rows) => rows[0]),
    ]);
    const workingLoadKg = Math.max(...entry.parsedSets.map((set) => set.weightKg));
    const performanceId = `performance-${input.resultId}-${entry.historySlotId}`;
    await db.insert(exercisePerformances).values({ id: performanceId, resultId: input.resultId, athleteId: input.athleteId, exerciseId: entry.historyExerciseId, slotId: entry.historySlotId, workingLoadKg, note: entry.note, performedAt: input.completedDate });
    await db.insert(strengthSets).values(entry.parsedSets.map((set) => ({ id: `set-${performanceId}-${set.setNumber}`, performanceId, ...set })));
    const progression = calculateProgression({ currentLoadKg: state?.currentLoadKg ?? null, pendingRecommendationKg: state?.recommendedLoadKg ?? null, workingLoadKg, reps: entry.parsedSets.map((set) => set.reps), repHigh: entry.slot.repHigh, incrementKg: setting?.loadIncrementKg ?? entry.exercise.defaultIncrementKg ?? 2.5 });
    const createdRecommendation = progression.earnedProgression && (state?.recommendedLoadKg == null || progression.acceptedPending);
    if (createdRecommendation && progression.recommendedLoadKg !== null) progressionMessages.push(`${entry.exercise.name}: try ${progression.recommendedLoadKg} kg next time`);
    else if (progression.acceptedPending) progressionMessages.push(`${entry.exercise.name} progressed to ${workingLoadKg} kg`);
    await db.insert(progressionStates).values({ athleteId: input.athleteId, exerciseId: entry.historyExerciseId, currentLoadKg: progression.currentLoadKg, recommendedLoadKg: progression.recommendedLoadKg, lastPerformanceId: performanceId, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: [progressionStates.athleteId, progressionStates.exerciseId], set: { currentLoadKg: progression.currentLoadKg, recommendedLoadKg: progression.recommendedLoadKg, lastPerformanceId: performanceId, updatedAt: new Date().toISOString() } });
  }
  return { progressionMessages };
}
