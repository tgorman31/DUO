import { eq } from "drizzle-orm";
import type { TrainingDb } from "@/db/seed";
import { strengthFocusSlots, strengthSlots, strengthTemplates } from "@/db/schema";

/** Clone a Strength A/B template through the same V2 identity rules used by the API. */
export async function cloneStrengthTemplate(db: TrainingDb, sourceId: string, input: { id: string; teamId: string; name: string; purpose?: string }) {
  const source = await db.select().from(strengthTemplates).where(eq(strengthTemplates.id, sourceId)).limit(1).then((rows) => rows[0]);
  if (!source) throw new Error("Strength template not found.");
  const sourceSlots = await db.select().from(strengthFocusSlots).where(eq(strengthFocusSlots.templateId, sourceId)).orderBy(strengthFocusSlots.sortOrder);
  await db.insert(strengthTemplates).values({ id: input.id, teamId: input.teamId, name: input.name, purpose: input.purpose ?? source.purpose, isBuiltIn: false, baseTemplateId: sourceId, active: true, updatedAt: new Date().toISOString() });
  for (const [index, sourceSlot] of sourceSlots.entries()) {
    const historySlotId = `${input.id}-history-${index + 1}`;
    const history = sourceSlot.historySlotId ? await db.select().from(strengthSlots).where(eq(strengthSlots.id, sourceSlot.historySlotId)).limit(1).then((rows) => rows[0]) : null;
    if (!history) throw new Error(`Strength slot ${sourceSlot.id} has no history identity.`);
    await db.insert(strengthSlots).values({ id: historySlotId, workoutKind: input.id, sortOrder: index, trainingGoal: history.trainingGoal, defaultExerciseId: history.defaultExerciseId, workingSets: history.workingSets, repLow: history.repLow, repHigh: history.repHigh });
    await db.insert(strengthFocusSlots).values({ id: `${input.id}-slot-${index + 1}`, templateId: input.id, focusId: sourceSlot.focusId, exerciseId: sourceSlot.exerciseId, historySlotId, prescription: sourceSlot.prescription, sortOrder: index, notes: sourceSlot.notes });
  }
  return { id: input.id, slotCount: sourceSlots.length };
}
