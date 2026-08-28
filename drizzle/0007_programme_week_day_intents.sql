CREATE TABLE `programme_week_day_intents` (
  `id` text PRIMARY KEY NOT NULL,
  `week_id` text NOT NULL REFERENCES `planned_weeks`(`id`),
  `day` integer NOT NULL,
  `intent` text NOT NULL,
  `workout_id` text REFERENCES `workout_library_items`(`id`),
  `strength_template_id` text REFERENCES `strength_templates`(`id`),
  `progression_track_id` text REFERENCES `progression_tracks`(`id`),
  `location_id` text REFERENCES `training_locations`(`id`),
  `priority_emphasis` text NOT NULL DEFAULT 'balanced',
  `category` text NOT NULL DEFAULT 'hard',
  `workout_kind` text NOT NULL DEFAULT '',
  `details` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE UNIQUE INDEX `programme_week_day_intent_unique` ON `programme_week_day_intents` (`week_id`,`day`);
