CREATE TABLE `athlete_exercise_settings` (
	`athlete_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`preferred_name` text DEFAULT '' NOT NULL,
	`load_convention` text,
	`load_increment_kg` real,
	`approved_alternatives_json` text DEFAULT '[]' NOT NULL,
	`default_alternative_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`athlete_id`, `exercise_id`),
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plan_history_items` (
	`id` text PRIMARY KEY NOT NULL,
	`week_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`before_json` text DEFAULT '{}' NOT NULL,
	`after_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`week_id`) REFERENCES `planned_weeks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_history_week_date_idx` ON `plan_history_items` (`week_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `plan_history_athlete_date_idx` ON `plan_history_items` (`athlete_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workout_favourites` (
	`athlete_id` text NOT NULL,
	`workout_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`athlete_id`, `workout_id`),
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workout_id`) REFERENCES `workout_library_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `athlete_sessions` ADD `workout_template_id` text;--> statement-breakpoint
ALTER TABLE `exercises` ADD `load_convention` text DEFAULT 'total_load' NOT NULL;--> statement-breakpoint
ALTER TABLE `shared_sessions` ADD `workout_template_id` text;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `owner_athlete_id` text REFERENCES athletes(id);--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `estimated_duration` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `warm_up` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `main_set` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `recovery` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `intensity_guidance` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `cool_down` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `equipment` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `result_type` text DEFAULT 'completion' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `custom_result_label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `is_built_in` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `created_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_library_items` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_results` ADD `total_time` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_results` ADD `distance` real;--> statement-breakpoint
ALTER TABLE `workout_results` ADD `rounds` real;--> statement-breakpoint
ALTER TABLE `workout_results` ADD `reps` integer;--> statement-breakpoint
ALTER TABLE `workout_results` ADD `calories` integer;--> statement-breakpoint
ALTER TABLE `workout_results` ADD `custom_value` real;
