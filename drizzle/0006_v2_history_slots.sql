ALTER TABLE `strength_focus_slots` ADD `history_slot_id` text REFERENCES `strength_slots`(`id`);
