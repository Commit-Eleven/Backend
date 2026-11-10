CREATE TABLE `lesson_progress` (
	`user_id` bigint NOT NULL,
	`lesson_id` varchar(64) NOT NULL,
	`language` varchar(20) NOT NULL,
	`completed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pk_lesson_progress` PRIMARY KEY(`user_id`,`lesson_id`)
);
--> statement-breakpoint
ALTER TABLE `lesson_progress` ADD CONSTRAINT `lesson_progress_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_lesson_user_language` ON `lesson_progress` (`user_id`,`language`);