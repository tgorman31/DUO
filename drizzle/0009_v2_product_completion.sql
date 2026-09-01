CREATE TABLE `workout_hyrox_coverage` (
  `workout_id` text NOT NULL REFERENCES `workout_library_items`(`id`),
  `station` text NOT NULL,
  `exposure` text NOT NULL DEFAULT 'direct',
  PRIMARY KEY(`workout_id`, `station`)
);
--> statement-breakpoint
CREATE INDEX `workout_hyrox_coverage_station_idx` ON `workout_hyrox_coverage` (`station`);
