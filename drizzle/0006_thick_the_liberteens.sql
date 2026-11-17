CREATE TABLE `login_code` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`code_hash` char(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_code_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_login_code_hash` UNIQUE(`code_hash`)
);
--> statement-breakpoint
ALTER TABLE `login_code` ADD CONSTRAINT `login_code_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;