CREATE TABLE `exp_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`problem_id` varchar(64),
	`amount` int NOT NULL,
	`reason` enum('solve','bonus','event') NOT NULL DEFAULT 'solve',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exp_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_explog_solve` UNIQUE(`user_id`,`problem_id`,`reason`)
);
--> statement-breakpoint
CREATE TABLE `friend` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`requester_id` bigint NOT NULL,
	`addressee_id` bigint NOT NULL,
	`status` enum('pending','accepted') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`responded_at` timestamp,
	CONSTRAINT `friend_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_friend_pair` UNIQUE(`requester_id`,`addressee_id`),
	CONSTRAINT `chk_friend_self` CHECK(`friend`.`requester_id` <> `friend`.`addressee_id`)
);
--> statement-breakpoint
CREATE TABLE `group_member` (
	`group_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`role` enum('owner','member') NOT NULL DEFAULT 'member',
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pk_group_member` PRIMARY KEY(`group_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `notification` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`type` enum('friend_request','friend_accepted','group_invite','group_joined','system') NOT NULL,
	`payload` json,
	`is_read` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_setting` (
	`user_id` bigint NOT NULL,
	`type` enum('friend_request','friend_accepted','group_invite','group_joined','system') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	CONSTRAINT `pk_noti_setting` PRIMARY KEY(`user_id`,`type`)
);
--> statement-breakpoint
CREATE TABLE `study_group` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`description` varchar(255),
	`owner_id` bigint NOT NULL,
	`capacity` smallint NOT NULL DEFAULT 10,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `study_group_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submission` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`problem_id` varchar(64) NOT NULL,
	`is_correct` boolean NOT NULL,
	`answer` json,
	`run_output` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `submission_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255),
	`nickname` varchar(30) NOT NULL,
	`tier` enum('normal','creator','admin') NOT NULL DEFAULT 'normal',
	`total_exp` int NOT NULL DEFAULT 0,
	`provider` enum('local','google') NOT NULL DEFAULT 'local',
	`provider_id` varchar(128),
	`study_unit_id` varchar(64),
	`study_language` varchar(20) NOT NULL DEFAULT 'python',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_email` UNIQUE(`email`),
	CONSTRAINT `uq_user_nickname` UNIQUE(`nickname`),
	CONSTRAINT `uq_user_provider` UNIQUE(`provider`,`provider_id`)
);
--> statement-breakpoint
ALTER TABLE `exp_log` ADD CONSTRAINT `exp_log_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `friend` ADD CONSTRAINT `friend_requester_id_user_id_fk` FOREIGN KEY (`requester_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `friend` ADD CONSTRAINT `friend_addressee_id_user_id_fk` FOREIGN KEY (`addressee_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_member` ADD CONSTRAINT `group_member_group_id_study_group_id_fk` FOREIGN KEY (`group_id`) REFERENCES `study_group`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_member` ADD CONSTRAINT `group_member_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification` ADD CONSTRAINT `notification_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_setting` ADD CONSTRAINT `notification_setting_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_group` ADD CONSTRAINT `study_group_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submission` ADD CONSTRAINT `submission_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_explog_user` ON `exp_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_friend_addressee` ON `friend` (`addressee_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_gm_user` ON `group_member` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_noti_user` ON `notification` (`user_id`,`is_read`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_group_owner` ON `study_group` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_sub_user_problem` ON `submission` (`user_id`,`problem_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sub_user_correct` ON `submission` (`user_id`,`is_correct`);--> statement-breakpoint
CREATE INDEX `idx_user_exp` ON `user` (`total_exp`);