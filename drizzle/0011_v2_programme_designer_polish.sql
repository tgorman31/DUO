ALTER TABLE `programme_week_day_intents` ADD `is_programme_override` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `programme_week_day_intent_override_idx` ON `programme_week_day_intents` (`week_id`, `is_programme_override`);
