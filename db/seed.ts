import { eq, notInArray } from "drizzle-orm";
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
  athleteCurrentLocations,
  athleteHyroxPriorities,
  catalogueExercises,
  exerciseFocusLinks,
  focusHyroxRelationships,
  locationEquipment,
  programmeWeekRecommendations,
  progressionSteps,
  progressionStatesV2,
  progressionTracks,
  strengthFocusSlots,
  strengthTemplates,
  trainingFocuses,
  trainingLocations,
  weekTypeDayIntents,
  weekTypeTemplates,
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
  WEEK_TYPE_INFO,
  WEEK_SEEDS,
  WORKOUT_LIBRARY_SEEDS,
  workoutTemplateIdForSession,
  type WeekSeed,
} from "@/lib/training-data";
import { d1InsertBatches } from "@/lib/d1-limits";
import {
  V2_EXERCISE_CATALOGUE,
  V2_HYROX_FOCUS_RELATIONSHIPS,
  V2_TRAINING_FOCUSES,
} from "@/lib/v2-catalogue";

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
  await db.delete(programmeWeekRecommendations);
  await db.delete(plannedWeeks);
  await db.delete(events);
  await db.delete(trainingPhases);
  await db.delete(workoutFavourites);
  await db.delete(athleteHyroxPriorities);
  await db.delete(athleteCurrentLocations);
  await db.delete(exerciseFocusLinks);
  await db.delete(focusHyroxRelationships);
  await db.delete(trainingFocuses).where(eq(trainingFocuses.isBuiltIn, false));
  await db.delete(weekTypeDayIntents);
  await db.delete(weekTypeTemplates).where(eq(weekTypeTemplates.isBuiltIn, false));
  await db.delete(progressionStatesV2);
  await db.delete(progressionSteps);
  await db.delete(progressionTracks).where(eq(progressionTracks.isBuiltIn, false));
  await db.delete(strengthFocusSlots);
  await db.delete(strengthTemplates).where(eq(strengthTemplates.isBuiltIn, false));
  await db.delete(locationEquipment);
  await db.delete(trainingLocations).where(notInArray(trainingLocations.id, ["location-building-gym", "location-perpetua", "location-everlast"]));
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

function focusIdForName(name: string) {
  return V2_TRAINING_FOCUSES.find((focus) => focus.name === name)?.id ?? null;
}

export const LEGACY_SLOT_FOCUS_MAP: Record<string, string> = {
  "a-knee": "focus-heavy-knee",
  "a-push": "focus-hpush",
  "a-pull": "focus-vpull",
  "a-unilateral": "focus-unilateral",
  "a-hamstrings": "focus-ham-curl",
  "a-calves": "focus-calf",
  "a-grip": "focus-grip",
  "b-lower": "focus-heavy-knee",
  "b-row": "focus-hpull",
  "b-shoulder": "focus-vpush",
  "b-unilateral": "focus-unilateral",
  "b-quads": "focus-quad-accessory",
  "b-ski": "focus-vpull",
  "b-core": "focus-trunk",
};

/** Additive, idempotent V2 catalogue/programme seed. It deliberately keeps
 * legacy `exercises` rows as the source of existing history and records a
 * deterministic catalogue-to-legacy alias where names match. */
async function ensureV2Data(db: TrainingDb) {
  const now = new Date().toISOString();
  const focusRows = V2_TRAINING_FOCUSES.map((focus) => ({
    id: focus.id,
    name: focus.name,
    purpose: focus.purpose,
    defaultPrescription: focus.defaultPrescription,
    primaryMuscles: focus.primaryMuscles,
    sourcePatterns: focus.sourcePatterns,
    hyroxLinksJson: JSON.stringify(focus.hyroxLinks.split(";").map((item) => item.trim()).filter(Boolean)),
    programmingNotes: focus.programmingNotes,
    isBuiltIn: true,
    active: true,
    baseJson: JSON.stringify(focus),
    updatedAt: now,
  }));
  for (const batch of d1InsertBatches(focusRows)) await db.insert(trainingFocuses).values(batch).onConflictDoNothing();

  const legacyExercises = await db.select().from(exercises);
  const legacyByName = new Map(legacyExercises.map((exercise) => [exercise.name.toLowerCase(), exercise.id]));
  const catalogueRows = V2_EXERCISE_CATALOGUE.map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    sourceType: exercise.sourceType,
    sourceRow: exercise.sourceRow,
    family: exercise.family,
    trainingFocus: exercise.trainingFocus,
    secondaryFocus: exercise.secondaryFocus,
    tier: exercise.tier,
    defaultVisibility: exercise.defaultVisibility,
    focusRank: exercise.focusRank,
    difficulty: exercise.difficulty,
    primaryEquipment: exercise.primaryEquipment,
    secondaryEquipment: exercise.secondaryEquipment ?? "",
    bodyRegion: exercise.bodyRegion,
    movementPattern: exercise.movementPattern,
    mechanics: exercise.mechanics,
    laterality: exercise.laterality,
    primaryMuscleGroup: exercise.primaryMuscleGroup,
    secondaryMuscleGroups: exercise.secondaryMuscleGroups ?? "",
    helpsWithJson: JSON.stringify(exercise.helpsWith.split(";").map((item) => item.trim()).filter(Boolean)),
    directHyrox: exercise.directHyrox === "Yes",
    prescription: exercise.prescription,
    loadConvention: exercise.loadConvention,
    defaultIncrementKg: exercise.defaultIncrementKg,
    demoUrl: exercise.demoUrl,
    explanationUrl: exercise.explanationUrl,
    whyDuoKeeps: exercise.whyDuoKeeps,
    legacyExerciseId: legacyByName.get(exercise.name.toLowerCase()) ?? null,
    isBuiltIn: true,
    active: true,
    updatedAt: now,
  }));
  for (const batch of d1InsertBatches(catalogueRows)) await db.insert(catalogueExercises).values(batch).onConflictDoNothing();

  // Every V2 exercise receives a stable history-compatible legacy row. Exact
  // aliases reuse the existing V1 id; new catalogue exercises use a namespaced
  // compatibility id so completeStrength never has to drop valid entries.
  const compatibilityExercises = V2_EXERCISE_CATALOGUE.map((exercise) => ({
    id: legacyByName.get(exercise.name.toLowerCase()) ?? `catalogue-${exercise.id}`,
    name: exercise.name,
    trainingGoal: exercise.trainingFocus,
    defaultIncrementKg: exercise.defaultIncrementKg ?? 2.5,
    loadConvention: exercise.loadConvention,
    isAccessory: /accessory|curl|raise|calf|plank/i.test(exercise.trainingFocus),
    hyroxCarryoverJson: JSON.stringify(exercise.helpsWith.split(";").map((item) => item.trim()).filter(Boolean)),
    catalogueId: exercise.id,
  }));
  for (const batch of d1InsertBatches(compatibilityExercises)) await db.insert(exercises).values(batch).onConflictDoNothing();
  // Existing V1 rows are reused by normalized name where possible. Backfill
  // the stable catalogue link on those rows without touching any user history
  // or custom settings, so old IDs remain the canonical history IDs.
  for (const exercise of compatibilityExercises) {
    await db.update(exercises)
      .set({ catalogueId: exercise.catalogueId })
      .where(eq(exercises.id, exercise.id));
  }

  const links = V2_EXERCISE_CATALOGUE.flatMap((exercise) => {
    const primary = focusIdForName(exercise.trainingFocus);
    const secondary = exercise.secondaryFocus ? focusIdForName(exercise.secondaryFocus) : null;
    return [
      primary ? { exerciseId: exercise.id, focusId: primary, relationship: "primary" } : null,
      secondary ? { exerciseId: exercise.id, focusId: secondary, relationship: "secondary" } : null,
    ].filter(Boolean) as Array<{ exerciseId: string; focusId: string; relationship: string }>;
  });
  for (const batch of d1InsertBatches(links)) await db.insert(exerciseFocusLinks).values(batch).onConflictDoNothing();

  const relationships = V2_HYROX_FOCUS_RELATIONSHIPS.flatMap((relationship) => {
    const focusId = focusIdForName(relationship.focus);
    return focusId ? [{ focusId, station: relationship.station, score: relationship.score }] : [];
  });
  for (const batch of d1InsertBatches(relationships)) await db.insert(focusHyroxRelationships).values(batch).onConflictDoNothing();

  const locationRows = [
    { id: "location-building-gym", teamId: TEAM_ID, name: "Building Gym", notes: "Default shared gym", active: true, updatedAt: now },
    { id: "location-perpetua", teamId: TEAM_ID, name: "Perpetua", notes: "Class and treadmill access", active: true, updatedAt: now },
    { id: "location-everlast", teamId: TEAM_ID, name: "Everlast Performance Centre", notes: "Race-specific HYROX equipment", active: true, updatedAt: now },
  ];
  for (const batch of d1InsertBatches(locationRows)) await db.insert(trainingLocations).values(batch).onConflictDoNothing();
  // Keep defaults grounded in the known DUO context. Locations are deliberately
  // different: Building Gym is the normal machine/Smith gym, while Everlast
  // carries the race-specific implements. Users can extend either inventory.
  const inventories: Record<string, string[]> = {
    "location-building-gym": ["Smith Machine", "Leg Press Machine", "Leg Curl Machine", "Leg Extension Machine", "Dumbbell", "Barbell", "Bench (Flat)", "Cable", "Treadmill", "Bodyweight"],
    "location-perpetua": ["Treadmill", "Dumbbell", "Barbell", "Bench (Flat)", "SkiErg", "RowErg", "Bodyweight"],
    "location-everlast": ["Smith Machine", "Leg Press Machine", "Leg Curl Machine", "Leg Extension Machine", "Dumbbell", "Barbell", "Bench (Flat)", "Cable", "Treadmill", "SkiErg", "RowErg", "Sled", "Wall Balls", "Sandbag", "Farmer Carry Handles", "Bodyweight"],
  };
  const equipmentRows = Object.entries(inventories).flatMap(([locationId, items]) => items.map((equipment) => ({ locationId, equipment })));
  for (const batch of d1InsertBatches(equipmentRows)) await db.insert(locationEquipment).values(batch).onConflictDoNothing();
  const currentLocations = ["thomas", "kt"].map((athleteId) => ({ athleteId, locationId: "location-building-gym", updatedAt: now }));
  for (const batch of d1InsertBatches(currentLocations)) await db.insert(athleteCurrentLocations).values(batch).onConflictDoNothing();

  const templates = [
    { id: "strength-template-a", teamId: TEAM_ID, name: "Strength A", purpose: "DUO base squat / push emphasis", isBuiltIn: true, baseTemplateId: null, active: true, updatedAt: now },
    { id: "strength-template-b", teamId: TEAM_ID, name: "Strength B", purpose: "DUO base hinge / pull emphasis", isBuiltIn: true, baseTemplateId: null, active: true, updatedAt: now },
  ];
  for (const batch of d1InsertBatches(templates)) await db.insert(strengthTemplates).values(batch).onConflictDoNothing();
  // The V2 compatibility rows mirror the legacy slots with a `v2-` prefix.
  // They must not be treated as new source slots on subsequent/idempotent
  // seed runs (otherwise v2-v2-* focus slots accumulate).
  const slotRows = (await db.select().from(strengthSlots)).filter((slot) => !slot.id.startsWith("v2-"));
  const focusSlots = slotRows.map((slot) => {
    const focusId = LEGACY_SLOT_FOCUS_MAP[slot.id];
    if (!focusId) throw new Error(`V2 seed validation: unmapped built-in strength slot ${slot.id}`);
    return ({
    id: `v2-${slot.id}`,
    templateId: slot.workoutKind === "strength-a" ? "strength-template-a" : "strength-template-b",
    focusId,
    exerciseId: V2_EXERCISE_CATALOGUE.find((exercise) => exercise.name.toLowerCase() === (legacyExercises.find((item) => item.id === slot.defaultExerciseId)?.name ?? "").toLowerCase())?.id ?? null,
    prescription: `${slot.workingSets} × ${slot.repLow}–${slot.repHigh}`,
    sortOrder: slot.sortOrder,
    notes: "DUO base slot; editable without changing exercise history",
  }); });
  for (const batch of d1InsertBatches(focusSlots)) await db.insert(strengthFocusSlots).values(batch).onConflictDoNothing();
  for (const templateId of ["strength-template-a", "strength-template-b"]) {
    const baseSlots = focusSlots.filter((slot) => slot.templateId === templateId);
    await db.update(strengthTemplates).set({ baseJson: JSON.stringify(baseSlots), updatedAt: now }).where(eq(strengthTemplates.id, templateId));
  }
  const compatibilitySlots = slotRows.map((slot) => ({
    id: `v2-${slot.id}`,
    workoutKind: slot.workoutKind,
    sortOrder: slot.sortOrder,
    trainingGoal: V2_TRAINING_FOCUSES.find((focus) => focus.id === LEGACY_SLOT_FOCUS_MAP[slot.id])?.name ?? slot.trainingGoal,
    defaultExerciseId: slot.defaultExerciseId,
    workingSets: slot.workingSets,
    repLow: slot.repLow,
    repHigh: slot.repHigh,
  }));
  for (const batch of d1InsertBatches(compatibilitySlots)) await db.insert(strengthSlots).values(batch).onConflictDoNothing();

  const progressionSeeds = [
    { id: "track-lt2-running", name: "LT2 Running", purpose: "Build sustainable threshold running", steps: [["3 × 8 min", "3 × 8 min"], ["3 × 10 min", "3 × 10 min"], ["2 × 20 min", "2 × 20 min"], ["4 × 10 min", "4 × 10 min"]] },
    { id: "track-vo2-running", name: "VO₂ Running", purpose: "Develop repeatable faster running", steps: [["8 × 2 min", "8 × 2 min"], ["6 × 3 min", "6 × 3 min"]] },
    { id: "track-hyrox-threshold", name: "HYROX Threshold", purpose: "Sustain high output through stations", steps: [["25-min threshold AMRAP", "25 min"], ["35-min threshold AMRAP", "35 min"]] },
    { id: "track-hyrox-compromised", name: "HYROX Compromised Running", purpose: "Regain running rhythm after stations", steps: [["4 rounds compromised", "4 rounds"], ["5 rounds compromised", "5 rounds"]] },
  ];
  for (const track of progressionSeeds) {
    await db.insert(progressionTracks).values({ id: track.id, teamId: TEAM_ID, name: track.name, purpose: track.purpose, isBuiltIn: true, active: true, updatedAt: now }).onConflictDoNothing();
    const rows = track.steps.map(([title, prescription], index) => ({ id: `${track.id}-${index + 1}`, trackId: track.id, workoutId: null, title, prescription, sortOrder: index }));
    for (const batch of d1InsertBatches(rows)) await db.insert(progressionSteps).values(batch).onConflictDoNothing();
  }

  const weekTypeRows = Object.entries(WEEK_TYPE_INFO).map(([id, info]) => ({
    id: `week-type-${id}`, teamId: TEAM_ID, name: info.label, rationale: info.rationale, hardTarget: info.targets.hard, strengthTarget: info.targets.strength, easyTarget: info.targets.easy, defaultLocationId: "location-building-gym", priorityEmphasis: "balanced", isBuiltIn: true, active: true, baseJson: JSON.stringify(info), updatedAt: now,
  }));
  for (const batch of d1InsertBatches(weekTypeRows)) await db.insert(weekTypeTemplates).values(batch).onConflictDoNothing();
  const dayIntents = weekTypeRows.flatMap((weekType) => {
    const key = weekType.id.replace("week-type-", "");
    const schedule = scheduleForWeek({ id: `template-${key}`, weekType: key, qualityFocus: "" });
    return schedule.map((item) => ({
      id: `${weekType.id}-${item.day}`,
      weekTypeId: weekType.id,
      day: item.day,
      intent: item.title,
      workoutId: workoutTemplateIdForSession(item.title, item.workoutKind),
      strengthTemplateId: item.workoutKind === "strength-a" ? "strength-template-a" : item.workoutKind === "strength-b" ? "strength-template-b" : null,
      progressionTrackId: item.title.toLowerCase().includes("lt2") ? "track-lt2-running" : item.title.toLowerCase().includes("vo") ? "track-vo2-running" : item.title.toLowerCase().includes("compromised") ? "track-hyrox-compromised" : null,
      priorityEmphasis: "balanced",
    }))
  });
  for (const batch of d1InsertBatches(dayIntents)) await db.insert(weekTypeDayIntents).values(batch).onConflictDoNothing();
  const weeks = await db.select().from(plannedWeeks);
  const phases = await db.select().from(trainingPhases);
  const recommendations = weeks.map((week) => {
    const phase = phases.find((item) => item.blockId === week.blockId && item.startDate <= week.startDate && item.endDate >= week.startDate);
    return { id: `programme-recommendation-${week.id}`, weekId: week.id, phaseId: phase?.id ?? null, weekTypeId: `week-type-${week.weekType}`, progressionTrackId: week.qualityFocus.toLowerCase().includes("vo") ? "track-vo2-running" : week.qualityFocus.toLowerCase().includes("lt2") ? "track-lt2-running" : week.qualityFocus.toLowerCase().includes("hyrox") ? "track-hyrox-threshold" : null, title: week.title, rationale: week.rationale, qualityIntent: week.qualityFocus, updatedAt: now };
  });
  for (const batch of d1InsertBatches(recommendations)) await db.insert(programmeWeekRecommendations).values(batch).onConflictDoNothing();
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
    if (!versionMarker || versionMarker.value !== "2.0") {
      await ensureV11Data(db);
      await ensureV2Data(db);
      await db
        .insert(appMetadata)
        .values({ key: "data-version", value: "2.0", updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: appMetadata.key, set: { value: "2.0", updatedAt: new Date().toISOString() } });
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
      exerciseIds
        .filter((exerciseId) => !(slotId === "a-hamstrings" && exerciseId === "db-rdl"))
        .map((exerciseId) => ({ slotId, exerciseId })),
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
  await ensureV2Data(db);
  await db
    .insert(appMetadata)
    .values({ key: "data-version", value: "2.0", updatedAt: new Date().toISOString() })
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
