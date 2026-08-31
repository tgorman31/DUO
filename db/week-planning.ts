import { eq } from "drizzle-orm";
import type { TrainingDb } from "./seed";
import { athleteSessions, plannedWeeks, programmeWeekRecommendations, sharedSessions, strengthTemplates, weekTypeDayIntents, weekTypeTemplates, programmeWeekDayIntents, workoutLibraryItems, progressionTracks, progressionSteps, progressionStatesV2 } from "./schema";
import {
  addDays,
  scheduleForWeek,
  WEEK_TYPE_INFO,
  workoutTemplateIdForSession,
} from "@/lib/training-data";

type WeekPlanBasis = {
  id: string;
  startDate: string;
  weekType: string;
  qualityFocus: string;
};

type ProgrammeIntent = {
  id: string;
  weekId?: string;
  day: number;
  intent: string;
  workoutId: string | null;
  strengthTemplateId: string | null;
  progressionTrackId: string | null;
  locationId: string | null;
  priorityEmphasis: string;
  category?: string;
  workoutKind?: string;
  details?: string;
  isQualityIntent?: boolean;
};

/** Rebuild one unset programme week's recommendation from a reusable Week
 * Type. Explicit single-week changes intentionally replace stale intents. */
export async function applyWeekTypeToProgrammeWeek(db: TrainingDb, weekId: string, weekTypeId: string) {
  const [week] = await db.select({ confirmedAt: plannedWeeks.confirmedAt }).from(plannedWeeks).where(eq(plannedWeeks.id, weekId)).limit(1);
  if (!week) throw new Error("Programme week not found.");
  if (week.confirmedAt) throw new Error("Set programme weeks cannot be replaced.");
  const templateIntents = await db.select().from(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, weekTypeId));
  await db.delete(programmeWeekDayIntents).where(eq(programmeWeekDayIntents.weekId, weekId));
  const copied = templateIntents.map((intent) => ({
    id: `programme-intent-${weekId}-${intent.day}`,
    weekId,
    day: intent.day,
    intent: intent.intent,
    workoutId: intent.workoutId,
    strengthTemplateId: intent.strengthTemplateId,
    progressionTrackId: intent.progressionTrackId,
    locationId: intent.locationId,
    priorityEmphasis: intent.priorityEmphasis,
    category: intent.category,
    workoutKind: intent.workoutKind,
    details: intent.details,
    isQualityIntent: intent.isQualityIntent,
  }));
  for (let index = 0; index < copied.length; index += 20) {
    await db.insert(programmeWeekDayIntents).values(copied.slice(index, index + 20));
  }
  return copied;
}

/**
 * Apply an explicit single-week structural change. Programme-week intent rows
 * are deliberately more specific than a Week Type, but an athlete choosing a
 * different Week Type is also choosing to discard the old structure's quality
 * progression. A new progression must be selected deliberately afterwards.
 */
export async function setProgrammeWeekType(db: TrainingDb, weekId: string, weekTypeId: string) {
  const [template] = await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, weekTypeId)).limit(1);
  if (!template) throw new Error("Programme Week Type not found.");
  const now = new Date().toISOString();
  await db
    .insert(programmeWeekRecommendations)
    .values({
      id: `programme-recommendation-${weekId}`,
      weekId,
      weekTypeId: template.id,
      phaseId: null,
      progressionTrackId: null,
      title: template.name,
      rationale: template.rationale,
      qualityIntent: "",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: programmeWeekRecommendations.weekId,
      set: {
        weekTypeId: template.id,
        progressionTrackId: null,
        title: template.name,
        rationale: template.rationale,
        qualityIntent: "",
        updatedAt: now,
      },
    });
  return applyWeekTypeToProgrammeWeek(db, weekId, weekTypeId);
}

const ATHLETE_IDS = ["thomas", "kt"] as const;

function recommendedSharedRows(week: WeekPlanBasis) {
  return scheduleForWeek(week).map((item) => ({
    id: `shared-${week.id}-${item.day}`,
    weekId: week.id,
    scheduledDate: addDays(week.startDate, item.day),
    title: item.title,
    category: item.category,
    workoutKind: item.workoutKind,
    details: item.details,
    workoutTemplateId: workoutTemplateIdForSession(item.title, item.workoutKind),
    assignment: "together",
    sortOrder: item.day,
  }));
}

/**
 * Reconciles the seven recommended shared slots without touching completed
 * athlete sessions. When activate is false, every remaining uncompleted row is
 * kept as a recoverable database record but removed from the active plan.
 */
export async function reconcileRecommendedWeek(
  db: TrainingDb,
  week: WeekPlanBasis,
  activate: boolean,
) {
  const now = new Date().toISOString();
  const sharedRows = recommendedSharedRows(week);
  const currentAthleteRows = await db
    .select()
    .from(athleteSessions)
    .where(eq(athleteSessions.weekId, week.id));
  const desiredAthleteIds = new Set<string>();

  for (const row of sharedRows) {
    await db
      .insert(sharedSessions)
      .values(row)
      .onConflictDoUpdate({
        target: sharedSessions.id,
        set: {
          scheduledDate: row.scheduledDate,
          title: row.title,
          category: row.category,
          workoutKind: row.workoutKind,
          details: row.details,
          workoutTemplateId: row.workoutTemplateId,
          assignment: row.assignment,
          sortOrder: row.sortOrder,
          updatedAt: now,
        },
      });

    for (const athleteId of ATHLETE_IDS) {
      const id = `session-${athleteId}-${week.id}-${row.sortOrder}`;
      desiredAthleteIds.add(id);
      const existing = currentAthleteRows.find((item) => item.id === id);
      if (existing?.status === "completed") continue;

      const values = {
        id,
        weekId: week.id,
        sharedSessionId: row.id,
        athleteId,
        scheduledDate: row.scheduledDate,
        title: row.title,
        category: row.category,
        workoutKind: row.workoutKind,
        details: row.details,
        workoutTemplateId: row.workoutTemplateId,
        assignment: "together",
        status: activate ? "planned" : "removed",
        completedAt: null,
        sortOrder: row.sortOrder,
        updatedAt: now,
      };

      if (existing) {
        await db
          .update(athleteSessions)
          .set(values)
          .where(eq(athleteSessions.id, id));
      } else {
        await db.insert(athleteSessions).values(values);
      }
    }
  }

  for (const row of currentAthleteRows) {
    if (row.status === "completed" || desiredAthleteIds.has(row.id)) continue;
    await db
      .update(athleteSessions)
      .set({ status: "removed", assignment: "individual", updatedAt: now })
      .where(eq(athleteSessions.id, row.id));
  }

  return sharedRows;
}

/** Materialise the V2 Programme Designer recommendation into the same shared
 * and athlete session records used by the V1 Week/Train screens. This keeps a
 * Set week immutable even if its Week Type is edited later. */
export async function reconcileV2RecommendedWeek(
  db: TrainingDb,
  week: WeekPlanBasis,
  intents: Array<ProgrammeIntent>,
  activate: boolean,
  options: { defaultLocationId?: string | null; athleteId?: string; sharedProgression?: boolean } = {},
) {
  const now = new Date().toISOString();
  const currentAthleteRows = await db.select().from(athleteSessions).where(eq(athleteSessions.weekId, week.id));
  const desired = new Set<string>();
  const materialized: Array<Record<string, unknown>> = [];
  for (const intent of intents.sort((a, b) => a.day - b.day)) {
    const template = intent.strengthTemplateId ? await db.select().from(strengthTemplates).where(eq(strengthTemplates.id, intent.strengthTemplateId)).limit(1).then((rows) => rows[0]) : null;
    let workout = intent.workoutId ? await db.select().from(workoutLibraryItems).where(eq(workoutLibraryItems.id, intent.workoutId)).limit(1).then((rows) => rows[0]) : null;
    if (!workout && template) workout = await db.select().from(workoutLibraryItems).where(eq(workoutLibraryItems.strengthTemplateId, template.id)).limit(1).then((rows) => rows[0]);
    let title = workout?.name ?? template?.name ?? intent.intent;
    const intentMeta = intent as { details?: string; category?: string; workoutKind?: string };
    let details = workout?.purpose ?? template?.purpose ?? intentMeta.details ?? intent.intent;
    let resolvedWorkoutId = intent.workoutId ?? workout?.id ?? null;
    let category = workout?.category ?? intentMeta.category ?? (intent.intent.toLowerCase().includes("rest") || intent.intent.toLowerCase().includes("recovery") ? "recovery" : intent.intent.toLowerCase().includes("strength") ? "strength" : intent.intent.toLowerCase().includes("easy") ? "easy" : "hard");
    let workoutKind = workout?.family === "strength" || template ? (template?.id === "strength-template-b" ? "strength-b" : template?.id === "strength-template-a" ? "strength-a" : "strength-custom") : category === "recovery" ? "recovery" : intentMeta.workoutKind || workout?.family || category;

    // Resolve a programme-specific progression choice to its current step.
    // Completion, not elapsed calendar time, advances progression state.
    if (intent.progressionTrackId) {
      const [track] = await db.select().from(progressionTracks).where(eq(progressionTracks.id, intent.progressionTrackId)).limit(1);
      if (track) {
        const states = await db.select().from(progressionStatesV2).where(eq(progressionStatesV2.trackId, track.id)).limit(10);
        // A Together progression cannot advance past either athlete. Missing
        // state is explicitly step zero, rather than being omitted from the
        // minimum and allowing the other athlete's later row to win.
        const state = options.sharedProgression
          ? { currentStep: Math.min(...ATHLETE_IDS.map((athleteId) => states.find((row) => row.athleteId === athleteId)?.currentStep ?? 0)) }
          : options.athleteId
            ? states.find((row) => row.athleteId === options.athleteId)
            : undefined;
        const steps = await db.select().from(progressionSteps).where(eq(progressionSteps.trackId, track.id)).orderBy(progressionSteps.sortOrder);
        const step = steps[Math.min(state?.currentStep ?? 0, Math.max(steps.length - 1, 0))];
        if (step) {
          const linkedWorkout = step.workoutId ? await db.select().from(workoutLibraryItems).where(eq(workoutLibraryItems.id, step.workoutId)).limit(1).then((rows) => rows[0]) : null;
          title = linkedWorkout?.name ?? step.title;
          details = linkedWorkout?.purpose ?? step.prescription ?? details;
          category = linkedWorkout?.category ?? category;
          workoutKind = linkedWorkout?.family ?? workoutKind;
          workout = linkedWorkout ?? workout;
          resolvedWorkoutId = linkedWorkout?.id ?? null;
        }
      }
    }
    const row = {
      id: `shared-${week.id}-${intent.day}`,
      weekId: week.id,
      scheduledDate: addDays(week.startDate, intent.day),
      title,
      category,
      workoutKind,
      details,
      workoutTemplateId: resolvedWorkoutId,
      locationId: intent.locationId ?? options.defaultLocationId ?? null,
      assignment: "together",
      sortOrder: intent.day,
    };
    await db.insert(sharedSessions).values(row).onConflictDoUpdate({ target: sharedSessions.id, set: { scheduledDate: row.scheduledDate, title: row.title, category: row.category, workoutKind: row.workoutKind, details: row.details, workoutTemplateId: row.workoutTemplateId, locationId: row.locationId, assignment: row.assignment, sortOrder: row.sortOrder, updatedAt: now } });
    materialized.push(row);
    for (const athleteId of ATHLETE_IDS) {
      const id = `session-${athleteId}-${week.id}-${intent.day}`;
      desired.add(id);
      const existing = currentAthleteRows.find((item) => item.id === id);
      if (existing?.status === "completed") continue;
      const values = { id, weekId: week.id, sharedSessionId: row.id, athleteId, scheduledDate: row.scheduledDate, title: row.title, category: row.category, workoutKind: row.workoutKind, details: row.details, workoutTemplateId: row.workoutTemplateId, locationId: row.locationId, assignment: row.assignment, status: activate ? "planned" : "removed", completedAt: null, sortOrder: row.sortOrder, updatedAt: now };
      if (existing) await db.update(athleteSessions).set(values).where(eq(athleteSessions.id, id));
      else await db.insert(athleteSessions).values(values);
    }
  }
  for (const row of currentAthleteRows) if (row.status !== "completed" && !desired.has(row.id)) await db.update(athleteSessions).set({ status: "removed", assignment: "individual", updatedAt: now }).where(eq(athleteSessions.id, row.id));
  return materialized;
}

export async function unsetWeekPlanningState(db: TrainingDb, week: WeekPlanBasis) {
  const currentRows = await db
    .select()
    .from(athleteSessions)
    .where(eq(athleteSessions.weekId, week.id));
  const preservedCompleted = currentRows.filter((row) => row.status === "completed");
  const defaults = WEEK_TYPE_INFO[week.weekType]?.targets ?? {
    hard: 0,
    strength: 0,
    easy: 0,
  };

  await reconcileRecommendedWeek(db, week, false);
  await db
    .update(plannedWeeks)
    .set({
      confirmedAt: null,
      status: "recommended",
      hardTarget: defaults.hard,
      strengthTarget: defaults.strength,
      easyTarget: defaults.easy,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(plannedWeeks.id, week.id));

  return preservedCompleted;
}
