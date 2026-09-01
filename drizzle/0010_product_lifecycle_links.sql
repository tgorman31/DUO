ALTER TABLE `shared_sessions` ADD `progression_track_id` text;
--> statement-breakpoint
ALTER TABLE `shared_sessions` ADD `progression_step_id` text;
--> statement-breakpoint
ALTER TABLE `athlete_sessions` ADD `progression_track_id` text;
--> statement-breakpoint
ALTER TABLE `athlete_sessions` ADD `progression_step_id` text;
--> statement-breakpoint
CREATE INDEX `athlete_sessions_progression_idx` ON `athlete_sessions` (`progression_track_id`, `progression_step_id`);
