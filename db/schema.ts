import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const appMetadata = sqliteTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const trainingTeams = sqliteTable("training_teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const athletes = sqliteTable(
  "athletes",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => trainingTeams.id),
    athleteKey: text("athlete_key").notNull(),
    displayName: text("display_name").notNull(),
    authEmail: text("auth_email"),
    units: text("units").notNull().default("metric"),
    loadIncrementKg: real("load_increment_kg").notNull().default(2.5),
    preferredDaysJson: text("preferred_days_json").notNull().default("[]"),
    titleBarColor: text("title_bar_color").notNull().default("#000080"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("athletes_key_unique").on(table.athleteKey),
    uniqueIndex("athletes_auth_email_unique").on(table.authEmail),
    index("athletes_team_idx").on(table.teamId),
  ],
);

export const trainingBlocks = sqliteTable("training_blocks", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => trainingTeams.id),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  trainingGoal: text("training_goal").notNull().default(""),
  status: text("status").notNull().default("upcoming"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const trainingPhases = sqliteTable(
  "training_phases",
  {
    id: text("id").primaryKey(),
    blockId: text("block_id").notNull().references(() => trainingBlocks.id),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    focus: text("focus").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("training_phases_block_idx").on(table.blockId)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    blockId: text("block_id").notNull().references(() => trainingBlocks.id),
    name: text("name").notNull(),
    eventDate: text("event_date").notNull(),
    eventTime: text("event_time"),
    location: text("location").notNull().default(""),
    eventType: text("event_type").notNull(),
    raceFormat: text("race_format").notNull().default(""),
    partner: text("partner").notNull().default(""),
    priority: text("priority").notNull().default("B"),
    label: text("label").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("upcoming"),
    resultSummaryJson: text("result_summary_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("events_block_date_idx").on(table.blockId, table.eventDate)],
);

export const plannedWeeks = sqliteTable(
  "planned_weeks",
  {
    id: text("id").primaryKey(),
    blockId: text("block_id").notNull().references(() => trainingBlocks.id),
    startDate: text("start_date").notNull(),
    title: text("title").notNull(),
    weekType: text("week_type").notNull(),
    rationale: text("rationale").notNull().default(""),
    qualityFocus: text("quality_focus").notNull().default(""),
    hardTarget: integer("hard_target").notNull().default(2),
    strengthTarget: integer("strength_target").notNull().default(2),
    easyTarget: integer("easy_target").notNull().default(2),
    confirmedAt: text("confirmed_at"),
    status: text("status").notNull().default("planned"),
    programmeWeekTypeId: text("programme_week_type_id"),
    programmePhaseId: text("programme_phase_id"),
    programmeSnapshotJson: text("programme_snapshot_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("planned_weeks_block_start_unique").on(table.blockId, table.startDate),
  ],
);

export const planHistoryItems = sqliteTable(
  "plan_history_items",
  {
    id: text("id").primaryKey(),
    weekId: text("week_id").notNull().references(() => plannedWeeks.id),
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    beforeJson: text("before_json").notNull().default("{}"),
    afterJson: text("after_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    undoneAt: text("undone_at"),
  },
  (table) => [
    index("plan_history_week_date_idx").on(table.weekId, table.createdAt),
    index("plan_history_athlete_date_idx").on(table.athleteId, table.createdAt),
  ],
);

export const sharedSessions = sqliteTable(
  "shared_sessions",
  {
    id: text("id").primaryKey(),
    weekId: text("week_id").notNull().references(() => plannedWeeks.id),
    scheduledDate: text("scheduled_date").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    workoutKind: text("workout_kind").notNull(),
    details: text("details").notNull().default(""),
    workoutTemplateId: text("workout_template_id"),
    progressionTrackId: text("progression_track_id").references(() => progressionTracks.id),
    progressionStepId: text("progression_step_id").references(() => progressionSteps.id),
    locationId: text("location_id"),
    assignment: text("assignment").notNull().default("together"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("shared_sessions_week_date_idx").on(table.weekId, table.scheduledDate)],
);

export const athleteSessions = sqliteTable(
  "athlete_sessions",
  {
    id: text("id").primaryKey(),
    weekId: text("week_id").notNull().references(() => plannedWeeks.id),
    sharedSessionId: text("shared_session_id").references(() => sharedSessions.id),
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    scheduledDate: text("scheduled_date").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    workoutKind: text("workout_kind").notNull(),
    details: text("details").notNull().default(""),
    workoutTemplateId: text("workout_template_id"),
    progressionTrackId: text("progression_track_id").references(() => progressionTracks.id),
    progressionStepId: text("progression_step_id").references(() => progressionSteps.id),
    locationId: text("location_id"),
    assignment: text("assignment").notNull().default("together"),
    status: text("status").notNull().default("planned"),
    completedAt: text("completed_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("athlete_sessions_week_athlete_idx").on(table.weekId, table.athleteId),
    index("athlete_sessions_date_idx").on(table.athleteId, table.scheduledDate),
    index("athlete_sessions_shared_idx").on(table.sharedSessionId),
    index("athlete_sessions_progression_idx").on(table.progressionTrackId, table.progressionStepId),
  ],
);

export const workoutResults = sqliteTable(
  "workout_results",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => athleteSessions.id),
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    completedDate: text("completed_date").notNull(),
    rpe: integer("rpe"),
    feel: integer("feel"),
    averagePace: text("average_pace").notNull().default(""),
    totalTime: text("total_time").notNull().default(""),
    distance: real("distance"),
    rounds: real("rounds"),
    reps: integer("reps"),
    calories: integer("calories"),
    customValue: real("custom_value"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("workout_results_session_unique").on(table.sessionId),
    index("workout_results_athlete_date_idx").on(table.athleteId, table.completedDate),
  ],
);

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  trainingGoal: text("training_goal").notNull(),
  defaultIncrementKg: real("default_increment_kg").notNull().default(2.5),
  loadConvention: text("load_convention").notNull().default("total_load"),
  isAccessory: integer("is_accessory", { mode: "boolean" }).notNull().default(false),
  hyroxCarryoverJson: text("hyrox_carryover_json").notNull().default("[]"),
  catalogueId: text("catalogue_id"),
});

/** V2's opinionated catalogue is kept separate from the legacy exercise table.
 * Existing strength history continues to reference `exercises`; catalogue
 * rows link back through catalogueId when a deterministic alias exists. */
export const trainingFocuses = sqliteTable("training_focuses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull().default(""),
  defaultPrescription: text("default_prescription").notNull().default(""),
  primaryMuscles: text("primary_muscles").notNull().default(""),
  sourcePatterns: text("source_patterns").notNull().default(""),
  hyroxLinksJson: text("hyrox_links_json").notNull().default("[]"),
  programmingNotes: text("programming_notes").notNull().default(""),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  baseJson: text("base_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const catalogueExercises = sqliteTable("catalogue_exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull().default("Source database"),
  sourceRow: integer("source_row"),
  family: text("family").notNull().default(""),
  trainingFocus: text("training_focus").notNull(),
  secondaryFocus: text("secondary_focus"),
  tier: text("tier").notNull().default("Useful"),
  defaultVisibility: text("default_visibility").notNull().default("More options"),
  focusRank: integer("focus_rank").notNull().default(99),
  difficulty: text("difficulty").notNull().default(""),
  primaryEquipment: text("primary_equipment").notNull().default(""),
  secondaryEquipment: text("secondary_equipment").notNull().default(""),
  bodyRegion: text("body_region").notNull().default(""),
  movementPattern: text("movement_pattern").notNull().default(""),
  mechanics: text("mechanics").notNull().default(""),
  laterality: text("laterality").notNull().default(""),
  primaryMuscleGroup: text("primary_muscle_group").notNull().default(""),
  secondaryMuscleGroups: text("secondary_muscle_groups").notNull().default(""),
  helpsWithJson: text("helps_with_json").notNull().default("[]"),
  directHyrox: integer("direct_hyrox", { mode: "boolean" }).notNull().default(false),
  prescription: text("prescription").notNull().default(""),
  loadConvention: text("load_convention").notNull().default("total_load"),
  defaultIncrementKg: real("default_increment_kg"),
  demoUrl: text("demo_url"),
  explanationUrl: text("explanation_url"),
  whyDuoKeeps: text("why_duo_keeps").notNull().default(""),
  legacyExerciseId: text("legacy_exercise_id"),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("catalogue_exercises_focus_idx").on(table.trainingFocus), index("catalogue_exercises_tier_idx").on(table.tier)]);

export const exerciseFocusLinks = sqliteTable("exercise_focus_links", {
  exerciseId: text("exercise_id").notNull().references(() => catalogueExercises.id),
  focusId: text("focus_id").notNull().references(() => trainingFocuses.id),
  relationship: text("relationship").notNull().default("primary"),
}, (table) => [primaryKey({ columns: [table.exerciseId, table.focusId] })]);

export const focusHyroxRelationships = sqliteTable("focus_hyrox_relationships", {
  focusId: text("focus_id").notNull().references(() => trainingFocuses.id),
  station: text("station").notNull(),
  score: integer("score").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.focusId, table.station] }), index("focus_hyrox_station_idx").on(table.station)]);

export const trainingLocations = sqliteTable("training_locations", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => trainingTeams.id),
  name: text("name").notNull(),
  notes: text("notes").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("training_locations_team_idx").on(table.teamId)]);

export const locationEquipment = sqliteTable("location_equipment", {
  locationId: text("location_id").notNull().references(() => trainingLocations.id),
  equipment: text("equipment").notNull(),
}, (table) => [primaryKey({ columns: [table.locationId, table.equipment] })]);

export const athleteCurrentLocations = sqliteTable("athlete_current_locations", {
  athleteId: text("athlete_id").primaryKey().references(() => athletes.id),
  locationId: text("location_id").notNull().references(() => trainingLocations.id),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const athleteHyroxPriorities = sqliteTable("athlete_hyrox_priorities", {
  athleteId: text("athlete_id").notNull().references(() => athletes.id),
  rank: integer("rank").notNull(),
  station: text("station").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.athleteId, table.rank] }), uniqueIndex("athlete_hyrox_station_unique").on(table.athleteId, table.station)]);

export const strengthTemplates = sqliteTable("strength_templates", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => trainingTeams.id),
  name: text("name").notNull(),
  purpose: text("purpose").notNull().default(""),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  baseTemplateId: text("base_template_id"),
  baseJson: text("base_json").notNull().default("{}"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("strength_templates_team_idx").on(table.teamId)]);

export const strengthFocusSlots = sqliteTable("strength_focus_slots", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull().references(() => strengthTemplates.id),
  focusId: text("focus_id").notNull().references(() => trainingFocuses.id),
  exerciseId: text("exercise_id").references(() => catalogueExercises.id),
  historySlotId: text("history_slot_id").references(() => strengthSlots.id),
  prescription: text("prescription").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes").notNull().default(""),
}, (table) => [index("strength_focus_slots_template_idx").on(table.templateId, table.sortOrder)]);

export const progressionTracks = sqliteTable("progression_tracks", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => trainingTeams.id),
  name: text("name").notNull(),
  purpose: text("purpose").notNull().default(""),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const progressionSteps = sqliteTable("progression_steps", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull().references(() => progressionTracks.id),
  workoutId: text("workout_id").references(() => workoutLibraryItems.id),
  title: text("title").notNull(),
  prescription: text("prescription").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [index("progression_steps_track_idx").on(table.trackId, table.sortOrder)]);

export const progressionStatesV2 = sqliteTable("progression_states_v2", {
  athleteId: text("athlete_id").notNull().references(() => athletes.id),
  trackId: text("track_id").notNull().references(() => progressionTracks.id),
  currentStep: integer("current_step").notNull().default(0),
  togetherPending: integer("together_pending", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.athleteId, table.trackId] })]);

export const weekTypeTemplates = sqliteTable("week_type_templates", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => trainingTeams.id),
  name: text("name").notNull(),
  rationale: text("rationale").notNull().default(""),
  hardTarget: integer("hard_target").notNull().default(2),
  strengthTarget: integer("strength_target").notNull().default(2),
  easyTarget: integer("easy_target").notNull().default(2),
  defaultLocationId: text("default_location_id").references(() => trainingLocations.id),
  priorityEmphasis: text("priority_emphasis").notNull().default("balanced"),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  baseJson: text("base_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const weekTypeDayIntents = sqliteTable("week_type_day_intents", {
  id: text("id").primaryKey(),
  weekTypeId: text("week_type_id").notNull().references(() => weekTypeTemplates.id),
  day: integer("day").notNull(),
  intent: text("intent").notNull(),
  workoutId: text("workout_id").references(() => workoutLibraryItems.id),
  strengthTemplateId: text("strength_template_id").references(() => strengthTemplates.id),
  progressionTrackId: text("progression_track_id").references(() => progressionTracks.id),
  locationId: text("location_id").references(() => trainingLocations.id),
  priorityEmphasis: text("priority_emphasis").notNull().default("balanced"),
  category: text("category").notNull().default("hard"),
  workoutKind: text("workout_kind").notNull().default(""),
  details: text("details").notNull().default(""),
  isQualityIntent: integer("is_quality_intent", { mode: "boolean" }).notNull().default(false),
}, (table) => [uniqueIndex("week_type_day_intent_unique").on(table.weekTypeId, table.day)]);

/** A programme-week-specific copy/override of a reusable Week Type intent. */
export const programmeWeekDayIntents = sqliteTable("programme_week_day_intents", {
  id: text("id").primaryKey(),
  weekId: text("week_id").notNull().references(() => plannedWeeks.id),
  day: integer("day").notNull(),
  intent: text("intent").notNull(),
  workoutId: text("workout_id").references(() => workoutLibraryItems.id),
  strengthTemplateId: text("strength_template_id").references(() => strengthTemplates.id),
  progressionTrackId: text("progression_track_id").references(() => progressionTracks.id),
  locationId: text("location_id").references(() => trainingLocations.id),
  priorityEmphasis: text("priority_emphasis").notNull().default("balanced"),
  category: text("category").notNull().default("hard"),
  workoutKind: text("workout_kind").notNull().default(""),
  details: text("details").notNull().default(""),
  isQualityIntent: integer("is_quality_intent", { mode: "boolean" }).notNull().default(false),
}, (table) => [uniqueIndex("programme_week_day_intent_unique").on(table.weekId, table.day)]);

export const programmeWeekRecommendations = sqliteTable("programme_week_recommendations", {
  id: text("id").primaryKey(),
  weekId: text("week_id").notNull().references(() => plannedWeeks.id),
  phaseId: text("phase_id").references(() => trainingPhases.id),
  weekTypeId: text("week_type_id").references(() => weekTypeTemplates.id),
  progressionTrackId: text("progression_track_id").references(() => progressionTracks.id),
  title: text("title").notNull().default(""),
  rationale: text("rationale").notNull().default(""),
  qualityIntent: text("quality_intent").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("programme_week_recommendation_week_unique").on(table.weekId)]);

/** Explicit conditioning metadata. This deliberately avoids guessing station
 * coverage from workout names; strength coverage is aggregated separately. */
export const workoutHyroxCoverage = sqliteTable("workout_hyrox_coverage", {
  workoutId: text("workout_id").notNull().references(() => workoutLibraryItems.id),
  station: text("station").notNull(),
  exposure: text("exposure").notNull().default("direct"),
}, (table) => [primaryKey({ columns: [table.workoutId, table.station] }), index("workout_hyrox_coverage_station_idx").on(table.station)]);

export const athleteExerciseSettings = sqliteTable(
  "athlete_exercise_settings",
  {
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    exerciseId: text("exercise_id").notNull().references(() => exercises.id),
    preferredName: text("preferred_name").notNull().default(""),
    loadConvention: text("load_convention"),
    loadIncrementKg: real("load_increment_kg"),
    approvedAlternativesJson: text("approved_alternatives_json").notNull().default("[]"),
    defaultAlternativeId: text("default_alternative_id"),
    notes: text("notes").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.athleteId, table.exerciseId] })],
);

export const strengthSlots = sqliteTable(
  "strength_slots",
  {
    id: text("id").primaryKey(),
    workoutKind: text("workout_kind").notNull(),
    sortOrder: integer("sort_order").notNull(),
    trainingGoal: text("training_goal").notNull(),
    defaultExerciseId: text("default_exercise_id").notNull().references(() => exercises.id),
    workingSets: integer("working_sets").notNull(),
    repLow: integer("rep_low").notNull(),
    repHigh: integer("rep_high").notNull(),
  },
  (table) => [index("strength_slots_workout_order_idx").on(table.workoutKind, table.sortOrder)],
);

export const slotAlternatives = sqliteTable(
  "slot_alternatives",
  {
    slotId: text("slot_id").notNull().references(() => strengthSlots.id),
    exerciseId: text("exercise_id").notNull().references(() => exercises.id),
  },
  (table) => [primaryKey({ columns: [table.slotId, table.exerciseId] })],
);

export const exercisePerformances = sqliteTable(
  "exercise_performances",
  {
    id: text("id").primaryKey(),
    resultId: text("result_id").notNull().references(() => workoutResults.id),
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    exerciseId: text("exercise_id").notNull().references(() => exercises.id),
    slotId: text("slot_id").notNull().references(() => strengthSlots.id),
    workingLoadKg: real("working_load_kg").notNull(),
    note: text("note").notNull().default(""),
    performedAt: text("performed_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("exercise_performances_history_idx").on(table.athleteId, table.exerciseId, table.performedAt),
  ],
);

export const strengthSets = sqliteTable(
  "strength_sets",
  {
    id: text("id").primaryKey(),
    performanceId: text("performance_id").notNull().references(() => exercisePerformances.id),
    setNumber: integer("set_number").notNull(),
    weightKg: real("weight_kg").notNull(),
    reps: integer("reps").notNull(),
  },
  (table) => [
    uniqueIndex("strength_sets_performance_set_unique").on(table.performanceId, table.setNumber),
  ],
);

export const progressionStates = sqliteTable(
  "progression_states",
  {
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    exerciseId: text("exercise_id").notNull().references(() => exercises.id),
    currentLoadKg: real("current_load_kg").notNull(),
    recommendedLoadKg: real("recommended_load_kg"),
    lastPerformanceId: text("last_performance_id").references(() => exercisePerformances.id),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.athleteId, table.exerciseId] })],
);

export const workoutLibraryItems = sqliteTable("workout_library_items", {
  id: text("id").primaryKey(),
  ownerAthleteId: text("owner_athlete_id").references(() => athletes.id),
  name: text("name").notNull(),
  family: text("family").notNull(),
  category: text("category").notNull(),
  prescription: text("prescription").notNull(),
  purpose: text("purpose").notNull(),
  estimatedDuration: text("estimated_duration").notNull().default(""),
  warmUp: text("warm_up").notNull().default(""),
  mainSet: text("main_set").notNull().default(""),
  recovery: text("recovery").notNull().default(""),
  intensityGuidance: text("intensity_guidance").notNull().default(""),
  coolDown: text("cool_down").notNull().default(""),
  equipment: text("equipment").notNull().default(""),
  notes: text("notes").notNull().default(""),
  resultType: text("result_type").notNull().default("completion"),
  customResultLabel: text("custom_result_label").notNull().default(""),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(true),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
  strengthTemplateId: text("strength_template_id"),
  priorityEmphasis: text("priority_emphasis").notNull().default("balanced"),
});

export const workoutFavourites = sqliteTable(
  "workout_favourites",
  {
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    workoutId: text("workout_id").notNull().references(() => workoutLibraryItems.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.athleteId, table.workoutId] })],
);

export const activityFeedItems = sqliteTable(
  "activity_feed_items",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => trainingTeams.id),
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    activityType: text("activity_type").notNull(),
    message: text("message").notNull(),
    entityId: text("entity_id").notNull().default(""),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("activity_feed_team_date_idx").on(table.teamId, table.createdAt)],
);

export const reactions = sqliteTable(
  "reactions",
  {
    activityId: text("activity_id").notNull().references(() => activityFeedItems.id),
    athleteId: text("athlete_id").notNull().references(() => athletes.id),
    emoji: text("emoji").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.activityId, table.athleteId] })],
);

export const raceReviews = sqliteTable(
  "race_reviews",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => events.id),
    athleteKey: text("athlete_key").notNull(),
    reviewType: text("review_type").notNull(),
    overallTime: text("overall_time").notNull().default(""),
    averageRunPace: text("average_run_pace").notNull().default(""),
    transitionTime: text("transition_time").notNull().default(""),
    stationTimesJson: text("station_times_json").notNull().default("{}"),
    reflectionJson: text("reflection_json").notNull().default("{}"),
    rpe: integer("rpe"),
    feel: integer("feel"),
    notes: text("notes").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("race_reviews_event_athlete_unique").on(table.eventId, table.athleteKey)],
);
