CREATE TABLE `request_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` varchar(100) NOT NULL,
	`user_id` int,
	`role` enum('klien','pt','admin'),
	`method` varchar(10) NOT NULL,
	`endpoint` varchar(255) NOT NULL,
	`status` int NOT NULL,
	`message` varchar(255),
	`duration_ms` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `request_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `request_logs` ADD CONSTRAINT `request_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_request_logs_request_id` ON `request_logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_request_logs_created_at` ON `request_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_request_logs_status` ON `request_logs` (`status`);