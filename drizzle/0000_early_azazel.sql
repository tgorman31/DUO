CREATE TABLE `activity_feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`activity_type` text NOT NULL,
	`message` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `training_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_feed_team_date_idx` ON `activity_feed_items` (`team_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `athlete_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`week_id` text NOT NULL,
	`shared_session_id` text,
	`athlete_id` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`workout_kind` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`assignment` text DEFAULT 'together' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`completed_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `planned_weeks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shared_session_id`) REFERENCES `shared_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `athlete_sessions_week_athlete_idx` ON `athlete_sessions` (`week_id`,`athlete_id`);--> statement-breakpoint
CREATE INDEX `athlete_sessions_date_idx` ON `athlete_sessions` (`athlete_id`,`scheduled_date`);--> statement-breakpoint
CREATE INDEX `athlete_sessions_shared_idx` ON `athlete_sessions` (`shared_session_id`);--> statement-breakpoint
CREATE TABLE `athletes` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`athlete_key` text NOT NULL,
	`display_name` text NOT NULL,
	`auth_email` text,
	`units` text DEFAULT 'metric' NOT NULL,
	`load_increment_kg` real DEFAULT 2.5 NOT NULL,
	`preferred_days_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `training_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `athletes_key_unique` ON `athletes` (`athlete_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `athletes_auth_email_unique` ON `athletes` (`auth_email`);--> statement-breakpoint
CREATE INDEX `athletes_team_idx` ON `athletes` (`team_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`name` text NOT NULL,
	`event_date` text NOT NULL,
	`event_time` text,
	`location` text DEFAULT '' NOT NULL,
	`event_type` text NOT NULL,
	`race_format` text DEFAULT '' NOT NULL,
	`partner` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'B' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`result_summary_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `training_blocks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_block_date_idx` ON `events` (`block_id`,`event_date`);--> statement-breakpoint
CREATE TABLE `exercise_performances` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`working_load_kg` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`performed_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `workout_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `strength_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exercise_performances_history_idx` ON `exercise_performances` (`athlete_id`,`exercise_id`,`performed_at`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`training_goal` text NOT NULL,
	`default_increment_kg` real DEFAULT 2.5 NOT NULL,
	`is_accessory` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `planned_weeks` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`start_date` text NOT NULL,
	`title` text NOT NULL,
	`week_type` text NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`quality_focus` text DEFAULT '' NOT NULL,
	`hard_target` integer DEFAULT 2 NOT NULL,
	`strength_target` integer DEFAULT 2 NOT NULL,
	`easy_target` integer DEFAULT 2 NOT NULL,
	`confirmed_at` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `training_blocks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_weeks_block_start_unique` ON `planned_weeks` (`block_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `progression_states` (
	`athlete_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`current_load_kg` real NOT NULL,
	`recommended_load_kg` real,
	`last_performance_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`athlete_id`, `exercise_id`),
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_performance_id`) REFERENCES `exercise_performances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `race_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`athlete_key` text NOT NULL,
	`review_type` text NOT NULL,
	`overall_time` text DEFAULT '' NOT NULL,
	`average_run_pace` text DEFAULT '' NOT NULL,
	`transition_time` text DEFAULT '' NOT NULL,
	`station_times_json` text DEFAULT '{}' NOT NULL,
	`reflection_json` text DEFAULT '{}' NOT NULL,
	`rpe` integer,
	`feel` integer,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `race_reviews_event_athlete_unique` ON `race_reviews` (`event_id`,`athlete_key`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`activity_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`activity_id`, `athlete_id`),
	FOREIGN KEY (`activity_id`) REFERENCES `activity_feed_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shared_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`week_id` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`workout_kind` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`assignment` text DEFAULT 'together' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `planned_weeks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shared_sessions_week_date_idx` ON `shared_sessions` (`week_id`,`scheduled_date`);--> statement-breakpoint
CREATE TABLE `slot_alternatives` (
	`slot_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	PRIMARY KEY(`slot_id`, `exercise_id`),
	FOREIGN KEY (`slot_id`) REFERENCES `strength_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `strength_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `exercise_performances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `strength_sets_performance_set_unique` ON `strength_sets` (`performance_id`,`set_number`);--> statement-breakpoint
CREATE TABLE `strength_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_kind` text NOT NULL,
	`sort_order` integer NOT NULL,
	`training_goal` text NOT NULL,
	`default_exercise_id` text NOT NULL,
	`working_sets` integer NOT NULL,
	`rep_low` integer NOT NULL,
	`rep_high` integer NOT NULL,
	FOREIGN KEY (`default_exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `strength_slots_workout_order_idx` ON `strength_slots` (`workout_kind`,`sort_order`);--> statement-breakpoint
CREATE TABLE `training_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`training_goal` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `training_teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `training_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`focus` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `training_blocks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `training_phases_block_idx` ON `training_phases` (`block_id`);--> statement-breakpoint
CREATE TABLE `training_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`family` text NOT NULL,
	`category` text NOT NULL,
	`prescription` text NOT NULL,
	`purpose` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_results` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`completed_date` text NOT NULL,
	`rpe` integer,
	`feel` integer,
	`average_pace` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `athlete_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_results_session_unique` ON `workout_results` (`session_id`);--> statement-breakpoint
CREATE INDEX `workout_results_athlete_date_idx` ON `workout_results` (`athlete_id`,`completed_date`);