CREATE TABLE `refresh_token` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refresh_token_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_refresh_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `refresh_token` ADD CONSTRAINT `refresh_token_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_refresh_user` ON `refresh_token` (`user_id`);