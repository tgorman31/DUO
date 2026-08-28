import { eq } from "drizzle-orm";
import type { getDb } from ".";
import {
  activityFeedItems,
  appMetadata,
  athleteSessions,
  athletes,
  exercisePerformances,
  events,
  exercises,
  plannedWeeks,
  planHistoryItems,
  raceReviews,
  reactions,
  progressionStates,
  sharedSessions,
  slotAlternatives,
  strengthSlots,
  strengthSets,
  trainingBlocks,
  trainingPhases,
  trainingTeams,
  workoutLibraryItems,
  workoutFavourites,
  workoutResults,
} from "./schema";
import {
  addDays,
  EVENT_SEEDS,
  EXERCISE_SEEDS,
  HYROX_CARRYOVER,
  INITIAL_BLOCK_ID,
  PHASE_SEEDS,
  scheduleForWeek,
  SLOT_ALTERNATIVES,
  STRENGTH_SLOT_SEEDS,
  TEAM_ID,
  WEEK_SEEDS,
  WORKOUT_LIBRARY_SEEDS,
  workoutTemplateIdForSession,
  type WeekSeed,
} from "@/lib/training-data";
import { d1InsertBatches } from "@/lib/d1-limits";

export type TrainingDb = ReturnType<typeof getDb>;

/**
 * Clear transactional/testing data while leaving accounts, exercise metadata,
 * built-in workout templates and the database schema intact. The next
 * ensureSeeded call recreates the canonical initial block and week sessions.
 */
export async function resetTrainingData(db: TrainingDb) {
  // Delete children before their referenced parent rows (D1 foreign keys).
  await db.delete(strengthSets);
  await db.delete(progressionStates);
  await db.delete(exercisePerformances);
  await db.delete(workoutResults);
  await db.delete(raceReviews);
  await db.delete(reactions);
  await db.delete(activityFeedItems);
  await db.delete(planHistoryItems);
  await db.delete(athleteSessions);
  await db.delete(sharedSessions);
  await db.delete(plannedWeeks);
  await db.delete(events);
  await db.delete(trainingPhases);
  await db.delete(workoutFavourites);
  await db.delete(workoutLibraryItems).where(eq(workoutLibraryItems.isBuiltIn, false));
  await db.delete(trainingBlocks);
  // The seed marker is intentionally removed so ensureSeeded rebuilds the
  // initial block/events/programme on the next authenticated request.
  await db.delete(appMetadata).where(eq(appMetadata.key, "data-version"));
  await ensureSeeded(db);
}

async function ensureV11Data(db: TrainingDb) {
  for (const workout of WORKOUT_LIBRARY_SEEDS) {
    await db
      .update(workoutLibraryItems)
      .set({
        name: workout.name,
        family: workout.family,
        category: workout.category,
        prescription: workout.prescription,
        purpose: workout.purpose,
        estimatedDuration: workout.estimatedDuration,
        warmUp: workout.warmUp,
        mainSet: workout.mainSet,
        recovery: workout.recovery,
        intensityGuidance: workout.intensityGuidance,
        coolDown: workout.coolDown,
        equipment: workout.equipment,
        notes: workout.notes,
        resultType: workout.resultType,
        customResultLabel: workout.customResultLabel,
        isBuiltIn: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workoutLibraryItems.id, workout.id));
  }

  const exerciseSettings = [
    ["smith-squat", 5, "total_load"],
    ["leg-press", 10, "machine_stack"],
    ["db-press", 2, "per_hand"],
    ["db-rdl", 2, "per_hand"],
    ["db-row", 2, "per_hand"],
    ["db-shoulder-press", 2, "per_hand"],
    ["farmer-carry", 2, "per_hand"],
    ["suitcase-hold", 2, "single_load"],
    ["suitcase-carry", 2, "single_load"],
    ["dead-hang", 0, "time"],
    ["side-plank", 0, "time"],
  ] as const;
  for (const [id, defaultIncrementKg, loadConvention] of exerciseSettings) {
    await db
      .update(exercises)
      .set({ defaultIncrementKg, loadConvention, hyroxCarryoverJson: JSON.stringify(HYROX_CARRYOVER[id] ?? []) })
      .where(eq(exercises.id, id));
  }
  for (const [id, carryover] of Object.entries(HYROX_CARRYOVER)) {
    await db.update(exercises)
      .set({ hyroxCarryoverJson: JSON.stringify(carryover) })
      .where(eq(exercises.id, id));
  }
}

export async function ensureSeeded(db: TrainingDb) {
  const [seedMarker] = await db
    .select({ id: activityFeedItems.id })
    .from(activityFeedItems)
    .where(eq(activityFeedItems.id, "activity-kt-ready"))
    .limit(1);
  if (seedMarker) {
    const [versionMarker] = await db
      .select({ key: appMetadata.key, value: appMetadata.value })
      .from(appMetadata)
      .where(eq(appMetadata.key, "data-version"))
      .limit(1);
    if (!versionMarker || versionMarker.value !== "1.5") {
      await ensureV11Data(db);
      await db
        .insert(appMetadata)
        .values({ key: "data-version", value: "1.5", updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: appMetadata.key, set: { value: "1.5", updatedAt: new Date().toISOString() } });
    }
    return;
  }

  await db
    .insert(trainingTeams)
    .values({ id: TEAM_ID, name: "Thomas + KT" })
    .onConflictDoNothing();

  const athleteSeedRows = [
    {
      id: "thomas",
      teamId: TEAM_ID,
      athleteKey: "thomas",
      displayName: "Thomas",
      loadIncrementKg: 2.5,
      preferredDaysJson: JSON.stringify(["Monday", "Wednesday", "Friday", "Saturday"]),
    },
    {
      id: "kt",
      teamId: TEAM_ID,
      athleteKey: "kt",
      displayName: "KT",
      loadIncrementKg: 2.5,
      preferredDaysJson: JSON.stringify(["Monday", "Wednesday", "Friday", "Saturday"]),
    },
  ];
  for (const batch of d1InsertBatches(athleteSeedRows)) {
    await db.insert(athletes).values(batch).onConflictDoNothing();
  }

  await db
    .insert(trainingBlocks)
    .values({
      id: INITIAL_BLOCK_ID,
      teamId: TEAM_ID,
      name: "Post-SwissPeaks → HYROX Dublin → HYROX London",
      startDate: "2026-09-06",
      endDate: "2026-12-04",
      trainingGoal: "Recover well, rebuild strength and running, then peak for two mixed-doubles HYROX races.",
      status: "active",
      notes: "The plan is a guide. Weekly objectives matter more than preserving every original calendar slot.",
    })
    .onConflictDoNothing();

  const phaseSeedRows = PHASE_SEEDS.map((phase) => ({
    ...phase,
    blockId: INITIAL_BLOCK_ID,
  }));
  for (const batch of d1InsertBatches(phaseSeedRows)) {
    await db.insert(trainingPhases).values(batch).onConflictDoNothing();
  }

  const eventSeedRows = EVENT_SEEDS.map((event) => ({
    ...event,
    blockId: INITIAL_BLOCK_ID,
    status: "upcoming",
  }));
  for (const batch of d1InsertBatches(eventSeedRows)) {
    await db.insert(events).values(batch).onConflictDoNothing();
  }

  const exerciseSeedRows = EXERCISE_SEEDS.map(
    ([id, name, trainingGoal, defaultIncrementKg, isAccessory]) => ({
      id,
      name,
      trainingGoal,
      defaultIncrementKg,
      isAccessory,
      hyroxCarryoverJson: JSON.stringify(HYROX_CARRYOVER[id] ?? []),
    }),
  );
  for (const batch of d1InsertBatches(exerciseSeedRows)) {
    await db.insert(exercises).values(batch).onConflictDoNothing();
  }

  const strengthSlotSeedRows = STRENGTH_SLOT_SEEDS.map(
    ([id, workoutKind, sortOrder, trainingGoal, defaultExerciseId, workingSets, repLow, repHigh]) => ({
      id,
      workoutKind,
      sortOrder,
      trainingGoal,
      defaultExerciseId,
      workingSets,
      repLow,
      repHigh,
    }),
  );
  for (const batch of d1InsertBatches(strengthSlotSeedRows)) {
    await db.insert(strengthSlots).values(batch).onConflictDoNothing();
  }

  const alternativeSeedRows = Object.entries(SLOT_ALTERNATIVES).flatMap(
    ([slotId, exerciseIds]) =>
      exerciseIds.map((exerciseId) => ({ slotId, exerciseId })),
  );
  for (const batch of d1InsertBatches(alternativeSeedRows)) {
    await db.insert(slotAlternatives).values(batch).onConflictDoNothing();
  }

  const librarySeedRows = WORKOUT_LIBRARY_SEEDS.map((workout) => ({
    ...workout,
    isBuiltIn: true,
  }));
  for (const batch of d1InsertBatches(librarySeedRows)) {
    await db.insert(workoutLibraryItems).values(batch).onConflictDoNothing();
  }

  const weekSeedRows = WEEK_SEEDS.map((week) => ({
    ...week,
    blockId: INITIAL_BLOCK_ID,
  }));
  for (const batch of d1InsertBatches(weekSeedRows)) {
    await db.insert(plannedWeeks).values(batch).onConflictDoNothing();
  }

  for (const week of WEEK_SEEDS) {
    await seedWeekSessions(db, week);
  }

  const activitySeedRows = [
    {
      id: "activity-block-ready",
      teamId: TEAM_ID,
      athleteId: "thomas",
      activityType: "plan",
      message: "The Dublin → London training block is ready to plan together.",
      entityId: INITIAL_BLOCK_ID,
    },
    {
      id: "activity-kt-ready",
      teamId: TEAM_ID,
      athleteId: "kt",
      activityType: "plan",
      message: "KT's individual training history is ready.",
      entityId: "kt",
    },
  ];
  for (const batch of d1InsertBatches(activitySeedRows)) {
    await db.insert(activityFeedItems).values(batch).onConflictDoNothing();
  }

  await ensureV11Data(db);
  await db
    .insert(appMetadata)
    .values({ key: "data-version", value: "1.5", updatedAt: new Date().toISOString() })
    .onConflictDoNothing();
}

export async function seedWeekSessions(
  db: TrainingDb,
  week: WeekSeed | {
    id: string;
    startDate: string;
    weekType: string;
    qualityFocus: string;
  },
) {
  const schedule = scheduleForWeek(week);
  const sharedRows = schedule.map((item) => ({
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

  for (const batch of d1InsertBatches(sharedRows)) {
    await db.insert(sharedSessions).values(batch).onConflictDoNothing();
  }

  const athleteRows = ["thomas", "kt"].flatMap((athleteId) =>
    sharedRows.map((row) => ({
      id: `session-${athleteId}-${week.id}-${row.sortOrder}`,
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
      status: "planned",
      sortOrder: row.sortOrder,
    })),
  );

  for (const batch of d1InsertBatches(athleteRows)) {
    await db.insert(athleteSessions).values(batch).onConflictDoNothing();
  }
}

export async function rebuildWeekSessions(
  db: TrainingDb,
  week: {
    id: string;
    startDate: string;
    weekType: string;
    qualityFocus: string;
  },
) {
  const { reconcileRecommendedWeek } = await import("./week-planning");
  await reconcileRecommendedWeek(db, week, false);
}
