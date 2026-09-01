import { asc, eq } from "drizzle-orm";
import type { TrainingDb } from "@/db/seed";
import { athleteSessions, progressionStatesV2, progressionSteps, progressionTracks } from "@/db/schema";

export type ProgressionCompletionResult = {
  advanced: boolean;
  pendingPartner: boolean;
  completedTrack: boolean;
  message: string | null;
};

/**
 * Apply progression state for one explicitly linked planned session.
 * Session linkage is the identity: titles and categories are presentation only.
 * This function is intentionally idempotent for replayed result submissions.
 */
export async function completeProgressionForSession(
  db: TrainingDb,
  session: typeof athleteSessions.$inferSelect,
  athleteId: string,
): Promise<ProgressionCompletionResult> {
  const trackId = session.progressionTrackId;
  const stepId = session.progressionStepId;
  const unchanged: ProgressionCompletionResult = { advanced: false, pendingPartner: false, completedTrack: false, message: null };
  if (!trackId || !stepId) return unchanged;

  const [track] = await db.select().from(progressionTracks).where(eq(progressionTracks.id, trackId)).limit(1);
  if (!track) return unchanged;
  const steps = await db.select().from(progressionSteps).where(eq(progressionSteps.trackId, trackId)).orderBy(asc(progressionSteps.sortOrder));
  const expectedIndex = steps.findIndex((step) => step.id === stepId);
  if (expectedIndex < 0) return unchanged;

  const states = await db.select().from(progressionStatesV2).where(eq(progressionStatesV2.trackId, trackId));
  const currentFor = (id: string) => states.find((state) => state.athleteId === id)?.currentStep ?? 0;
  const writeState = async (id: string, currentStep: number, togetherPending: boolean) => {
    await db.insert(progressionStatesV2).values({ athleteId: id, trackId, currentStep, togetherPending, updatedAt: new Date().toISOString() }).onConflictDoUpdate({
      target: [progressionStatesV2.athleteId, progressionStatesV2.trackId],
      set: { currentStep, togetherPending, updatedAt: new Date().toISOString() },
    });
  };

  if (session.assignment === "together") {
    // An already-ahead athlete replaying the same completed session must not
    // be moved backwards or generate another advancement event.
    if (currentFor(athleteId) > expectedIndex) return { ...unchanged, completedTrack: currentFor(athleteId) >= steps.length };
    const linked = session.sharedSessionId
      ? await db.select().from(athleteSessions).where(eq(athleteSessions.sharedSessionId, session.sharedSessionId))
      : [];
    const bothDone = ["thomas", "kt"].every((id) => linked.some((row) => row.athleteId === id && row.status === "completed" && row.progressionTrackId === trackId && row.progressionStepId === stepId));
    if (!bothDone) {
      await writeState(athleteId, Math.max(currentFor(athleteId), expectedIndex), true);
      return { advanced: false, pendingPartner: true, completedTrack: false, message: `${track.name}: waiting for partner completion` };
    }
    const sharedNext = Math.min(expectedIndex + 1, steps.length);
    for (const id of ["thomas", "kt"]) await writeState(id, Math.max(currentFor(id), sharedNext), false);
    return { advanced: true, pendingPartner: false, completedTrack: sharedNext >= steps.length, message: `${track.name}: completed by both${sharedNext >= steps.length ? " — progression complete" : " — next step ready"}` };
  }

  if (currentFor(athleteId) !== expectedIndex) return unchanged;
  const next = Math.min(expectedIndex + 1, steps.length);
  await writeState(athleteId, next, false);
  return { advanced: true, pendingPartner: false, completedTrack: next >= steps.length, message: `${track.name}: ${next >= steps.length ? "progression complete" : "advanced to the next step"}` };
}
