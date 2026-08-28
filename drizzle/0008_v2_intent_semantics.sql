ALTER TABLE `week_type_day_intents` ADD COLUMN `category` text NOT NULL DEFAULT 'hard';
--> statement-breakpoint
ALTER TABLE `week_type_day_intents` ADD COLUMN `workout_kind` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `week_type_day_intents` ADD COLUMN `details` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `week_type_day_intents` ADD COLUMN `is_quality_intent` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `programme_week_day_intents` ADD COLUMN `is_quality_intent` integer NOT NULL DEFAULT 0;
