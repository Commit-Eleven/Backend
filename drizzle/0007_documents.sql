CREATE TABLE `document` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`group_id` bigint,
	`author_id` bigint NOT NULL,
	`kind` enum('note','wiki','report') NOT NULL,
	`status` enum('draft','pending','approved','rejected'),
	`title` varchar(100) NOT NULL,
	`body` mediumtext NOT NULL,
	`pinned` boolean NOT NULL DEFAULT false,
	`version` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_bookmark` (
	`user_id` bigint NOT NULL,
	`document_id` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pk_doc_bookmark` PRIMARY KEY(`user_id`,`document_id`)
);
--> statement-breakpoint
CREATE TABLE `document_comment` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`document_id` bigint NOT NULL,
	`author_id` bigint NOT NULL,
	`body` varchar(1000) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_comment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_review` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`document_id` bigint NOT NULL,
	`reviewer_id` bigint NOT NULL,
	`decision` enum('approved','rejected') NOT NULL,
	`comment` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_review_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_revision` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`document_id` bigint NOT NULL,
	`version` int NOT NULL,
	`editor_id` bigint NOT NULL,
	`title` varchar(100) NOT NULL,
	`body` mediumtext NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_revision_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_doc_revision` UNIQUE(`document_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `group_integration` (
	`group_id` bigint NOT NULL,
	`discord_webhook_url` varchar(255),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `group_integration_group_id` PRIMARY KEY(`group_id`)
);
--> statement-breakpoint
ALTER TABLE `group_member` MODIFY COLUMN `role` enum('owner','manager','member') NOT NULL DEFAULT 'member';--> statement-breakpoint
ALTER TABLE `notification` MODIFY COLUMN `type` enum('friend_request','friend_accepted','group_invite','group_joined','document_submitted','document_reviewed','document_comment','system') NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_setting` MODIFY COLUMN `type` enum('friend_request','friend_accepted','group_invite','group_joined','document_submitted','document_reviewed','document_comment','system') NOT NULL;--> statement-breakpoint
ALTER TABLE `document` ADD CONSTRAINT `document_group_id_study_group_id_fk` FOREIGN KEY (`group_id`) REFERENCES `study_group`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document` ADD CONSTRAINT `document_author_id_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_bookmark` ADD CONSTRAINT `document_bookmark_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_bookmark` ADD CONSTRAINT `document_bookmark_document_id_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_comment` ADD CONSTRAINT `document_comment_document_id_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_comment` ADD CONSTRAINT `document_comment_author_id_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_review` ADD CONSTRAINT `document_review_document_id_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_review` ADD CONSTRAINT `document_review_reviewer_id_user_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_revision` ADD CONSTRAINT `document_revision_document_id_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_revision` ADD CONSTRAINT `document_revision_editor_id_user_id_fk` FOREIGN KEY (`editor_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_integration` ADD CONSTRAINT `group_integration_group_id_study_group_id_fk` FOREIGN KEY (`group_id`) REFERENCES `study_group`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_doc_group` ON `document` (`group_id`,`kind`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_doc_author` ON `document` (`author_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_comment_doc` ON `document_comment` (`document_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_review_doc` ON `document_review` (`document_id`,`created_at`);