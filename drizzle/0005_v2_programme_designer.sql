ALTER TABLE `exercises` ADD `catalogue_id` text;
--> statement-breakpoint
CREATE TABLE `training_focuses` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `purpose` text DEFAULT '' NOT NULL,
  `default_prescription` text DEFAULT '' NOT NULL,
  `primary_muscles` text DEFAULT '' NOT NULL,
  `source_patterns` text DEFAULT '' NOT NULL,
  `hyrox_links_json` text DEFAULT '[]' NOT NULL,
  `programming_notes` text DEFAULT '' NOT NULL,
  `is_built_in` integer DEFAULT true NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `base_json` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalogue_exercises` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `source_type` text DEFAULT 'Source database' NOT NULL,
  `source_row` integer,
  `family` text DEFAULT '' NOT NULL,
  `training_focus` text NOT NULL,
  `secondary_focus` text,
  `tier` text DEFAULT 'Useful' NOT NULL,
  `default_visibility` text DEFAULT 'More options' NOT NULL,
  `focus_rank` integer DEFAULT 99 NOT NULL,
  `difficulty` text DEFAULT '' NOT NULL,
  `primary_equipment` text DEFAULT '' NOT NULL,
  `secondary_equipment` text DEFAULT '' NOT NULL,
  `body_region` text DEFAULT '' NOT NULL,
  `movement_pattern` text DEFAULT '' NOT NULL,
  `mechanics` text DEFAULT '' NOT NULL,
  `laterality` text DEFAULT '' NOT NULL,
  `primary_muscle_group` text DEFAULT '' NOT NULL,
  `secondary_muscle_groups` text DEFAULT '' NOT NULL,
  `helps_with_json` text DEFAULT '[]' NOT NULL,
  `direct_hyrox` integer DEFAULT false NOT NULL,
  `prescription` text DEFAULT '' NOT NULL,
  `load_convention` text DEFAULT 'total_load' NOT NULL,
  `default_increment_kg` real,
  `demo_url` text,
  `explanation_url` text,
  `why_duo_keeps` text DEFAULT '' NOT NULL,
  `legacy_exercise_id` text,
  `is_built_in` integer DEFAULT true NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalogue_exercises_focus_idx` ON `catalogue_exercises` (`training_focus`);
--> statement-breakpoint
CREATE INDEX `catalogue_exercises_tier_idx` ON `catalogue_exercises` (`tier`);
--> statement-breakpoint
CREATE TABLE `exercise_focus_links` (`exercise_id` text NOT NULL REFERENCES `catalogue_exercises`(`id`), `focus_id` text NOT NULL REFERENCES `training_focuses`(`id`), `relationship` text DEFAULT 'primary' NOT NULL, PRIMARY KEY(`exercise_id`, `focus_id`));
--> statement-breakpoint
CREATE TABLE `focus_hyrox_relationships` (`focus_id` text NOT NULL REFERENCES `training_focuses`(`id`), `station` text NOT NULL, `score` integer DEFAULT 0 NOT NULL, PRIMARY KEY(`focus_id`, `station`));
--> statement-breakpoint
CREATE INDEX `focus_hyrox_station_idx` ON `focus_hyrox_relationships` (`station`);
--> statement-breakpoint
CREATE TABLE `training_locations` (`id` text PRIMARY KEY NOT NULL, `team_id` text NOT NULL REFERENCES `training_teams`(`id`), `name` text NOT NULL, `notes` text DEFAULT '' NOT NULL, `active` integer DEFAULT true NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE INDEX `training_locations_team_idx` ON `training_locations` (`team_id`);
--> statement-breakpoint
CREATE TABLE `location_equipment` (`location_id` text NOT NULL REFERENCES `training_locations`(`id`), `equipment` text NOT NULL, PRIMARY KEY(`location_id`, `equipment`));
--> statement-breakpoint
CREATE TABLE `athlete_current_locations` (`athlete_id` text PRIMARY KEY NOT NULL REFERENCES `athletes`(`id`), `location_id` text NOT NULL REFERENCES `training_locations`(`id`), `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `athlete_hyrox_priorities` (`athlete_id` text NOT NULL REFERENCES `athletes`(`id`), `rank` integer NOT NULL, `station` text NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, PRIMARY KEY(`athlete_id`, `rank`));
--> statement-breakpoint
CREATE UNIQUE INDEX `athlete_hyrox_station_unique` ON `athlete_hyrox_priorities` (`athlete_id`, `station`);
--> statement-breakpoint
CREATE TABLE `strength_templates` (`id` text PRIMARY KEY NOT NULL, `team_id` text NOT NULL REFERENCES `training_teams`(`id`), `name` text NOT NULL, `purpose` text DEFAULT '' NOT NULL, `is_built_in` integer DEFAULT false NOT NULL, `base_template_id` text, `base_json` text DEFAULT '{}' NOT NULL, `active` integer DEFAULT true NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE INDEX `strength_templates_team_idx` ON `strength_templates` (`team_id`);
--> statement-breakpoint
CREATE TABLE `strength_focus_slots` (`id` text PRIMARY KEY NOT NULL, `template_id` text NOT NULL REFERENCES `strength_templates`(`id`), `focus_id` text NOT NULL REFERENCES `training_focuses`(`id`), `exercise_id` text REFERENCES `catalogue_exercises`(`id`), `prescription` text DEFAULT '' NOT NULL, `sort_order` integer DEFAULT 0 NOT NULL, `notes` text DEFAULT '' NOT NULL);
--> statement-breakpoint
ALTER TABLE `strength_focus_slots` ADD `history_slot_id` text REFERENCES strength_slots(id);
--> statement-breakpoint
CREATE INDEX `strength_focus_slots_template_idx` ON `strength_focus_slots` (`template_id`, `sort_order`);
--> statement-breakpoint
CREATE TABLE `progression_tracks` (`id` text PRIMARY KEY NOT NULL, `team_id` text NOT NULL REFERENCES `training_teams`(`id`), `name` text NOT NULL, `purpose` text DEFAULT '' NOT NULL, `is_built_in` integer DEFAULT false NOT NULL, `active` integer DEFAULT true NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `progression_steps` (`id` text PRIMARY KEY NOT NULL, `track_id` text NOT NULL REFERENCES `progression_tracks`(`id`), `workout_id` text REFERENCES `workout_library_items`(`id`), `title` text NOT NULL, `prescription` text DEFAULT '' NOT NULL, `sort_order` integer DEFAULT 0 NOT NULL);
--> statement-breakpoint
CREATE INDEX `progression_steps_track_idx` ON `progression_steps` (`track_id`, `sort_order`);
--> statement-breakpoint
CREATE TABLE `progression_states_v2` (`athlete_id` text NOT NULL REFERENCES `athletes`(`id`), `track_id` text NOT NULL REFERENCES `progression_tracks`(`id`), `current_step` integer DEFAULT 0 NOT NULL, `together_pending` integer DEFAULT false NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, PRIMARY KEY(`athlete_id`, `track_id`));
--> statement-breakpoint
CREATE TABLE `week_type_templates` (`id` text PRIMARY KEY NOT NULL, `team_id` text NOT NULL REFERENCES `training_teams`(`id`), `name` text NOT NULL, `rationale` text DEFAULT '' NOT NULL, `hard_target` integer DEFAULT 2 NOT NULL, `strength_target` integer DEFAULT 2 NOT NULL, `easy_target` integer DEFAULT 2 NOT NULL, `default_location_id` text REFERENCES `training_locations`(`id`), `priority_emphasis` text DEFAULT 'balanced' NOT NULL, `is_built_in` integer DEFAULT false NOT NULL, `active` integer DEFAULT true NOT NULL, `base_json` text DEFAULT '{}' NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `week_type_day_intents` (`id` text PRIMARY KEY NOT NULL, `week_type_id` text NOT NULL REFERENCES `week_type_templates`(`id`), `day` integer NOT NULL, `intent` text NOT NULL, `workout_id` text REFERENCES `workout_library_items`(`id`), `strength_template_id` text REFERENCES `strength_templates`(`id`), `progression_track_id` text REFERENCES `progression_tracks`(`id`), `location_id` text REFERENCES `training_locations`(`id`), `priority_emphasis` text DEFAULT 'balanced' NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `week_type_day_intent_unique` ON `week_type_day_intents` (`week_type_id`, `day`);
--> statement-breakpoint
CREATE TABLE `programme_week_recommendations` (`id` text PRIMARY KEY NOT NULL, `week_id` text NOT NULL REFERENCES `planned_weeks`(`id`), `phase_id` text REFERENCES `training_phases`(`id`), `week_type_id` text REFERENCES `week_type_templates`(`id`), `progression_track_id` text REFERENCES `progression_tracks`(`id`), `title` text DEFAULT '' NOT NULL, `rationale` text DEFAULT '' NOT NULL, `quality_intent` text DEFAULT '' NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `programme_week_recommendation_week_unique` ON `programme_week_recommendations` (`week_id`);
--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `strength_template_id` text REFERENCES strength_templates(id);
--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `priority_emphasis` text DEFAULT 'balanced' NOT NULL;
--> statement-breakpoint
ALTER TABLE `planned_weeks` ADD `programme_week_type_id` text REFERENCES week_type_templates(id);
--> statement-breakpoint
ALTER TABLE `planned_weeks` ADD `programme_phase_id` text REFERENCES training_phases(id);
--> statement-breakpoint
ALTER TABLE `planned_weeks` ADD `programme_snapshot_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `shared_sessions` ADD `location_id` text;
--> statement-breakpoint
ALTER TABLE `athlete_sessions` ADD `location_id` text;
