CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`username` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('klien','pt','admin') NOT NULL,
	`tema` enum('siang','malam') NOT NULL DEFAULT 'siang',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `pt_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`nama` varchar(100) NOT NULL,
	`usia` int,
	`jenis_kelamin` enum('pria','wanita'),
	`spesialisasi` enum('turun_bb','naik_bb'),
	`tempat_gym` varchar(150),
	CONSTRAINT `pt_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `pt_profiles_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `klien_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`nama` varchar(100) NOT NULL,
	`usia` int,
	`jenis_kelamin` enum('pria','wanita'),
	`alergi_makanan` text,
	`tinggi_badan_cm` float,
	`pt_id` int,
	CONSTRAINT `klien_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `klien_profiles_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `admin_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`nama` varchar(100) NOT NULL,
	CONSTRAINT `admin_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_profiles_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `pairing_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`klien_id` int NOT NULL,
	`pt_id` int NOT NULL,
	`status` enum('pending','diterima','ditolak') NOT NULL DEFAULT 'pending',
	`alasan_penolakan` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pairing_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weight_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`klien_id` int NOT NULL,
	`berat_badan_kg` float NOT NULL,
	`tanggal` date NOT NULL,
	CONSTRAINT `weight_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `progress_cycles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`klien_id` int NOT NULL,
	`bb_awal_kg` float NOT NULL,
	`bb_tujuan_kg` float NOT NULL,
	`tujuan` enum('turun_bb','naik_bb') NOT NULL,
	`durasi_hari` int NOT NULL,
	`target_kalori_per_hari` int NOT NULL,
	`status` enum('aktif','selesai') NOT NULL DEFAULT 'aktif',
	`tanggal_mulai` date NOT NULL,
	`tanggal_selesai` date,
	CONSTRAINT `progress_cycles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `master_olahraga` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nama` varchar(100) NOT NULL,
	`met_value` float NOT NULL,
	`kategori` enum('kardio','kekuatan','fleksibilitas') NOT NULL,
	`butuh_jarak` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `master_olahraga_id` PRIMARY KEY(`id`),
	CONSTRAINT `master_olahraga_nama_unique` UNIQUE(`nama`)
);
--> statement-breakpoint
CREATE TABLE `master_makanan` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nama` varchar(150) NOT NULL,
	`kalori_per_100g` float NOT NULL,
	`kategori` enum('karbohidrat','protein','sayur','lainnya') NOT NULL,
	`sumber` enum('seed','ai_generated') NOT NULL DEFAULT 'seed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `master_makanan_id` PRIMARY KEY(`id`),
	CONSTRAINT `master_makanan_nama_unique` UNIQUE(`nama`)
);
--> statement-breakpoint
CREATE TABLE `weekly_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`klien_id` int NOT NULL,
	`minggu_mulai` date NOT NULL,
	`workout_plan` json NOT NULL,
	`meal_plan` json NOT NULL,
	`status` enum('pending_review','disetujui','override') NOT NULL DEFAULT 'pending_review',
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp,
	CONSTRAINT `weekly_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`klien_id` int NOT NULL,
	`weekly_plan_id` int,
	`olahraga_id` int NOT NULL,
	`durasi_menit` int NOT NULL,
	`jarak_meter` float,
	`kalori_terbakar` int NOT NULL,
	`tanggal` date NOT NULL,
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meal_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`klien_id` int NOT NULL,
	`weekly_plan_id` int,
	`makanan_id` int NOT NULL,
	`porsi_gram` float NOT NULL,
	`kalori_masuk` int NOT NULL,
	`tanggal` date NOT NULL,
	CONSTRAINT `meal_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feedbacks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`klien_id` int NOT NULL,
	`pt_id` int,
	`source` enum('ai','pt') NOT NULL,
	`pesan` text NOT NULL,
	`balasan_klien` text,
	`dibaca` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feedbacks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`admin_id` int NOT NULL,
	`aksi` varchar(255) NOT NULL,
	`target_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pt_profiles` ADD CONSTRAINT `pt_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `klien_profiles` ADD CONSTRAINT `klien_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `klien_profiles` ADD CONSTRAINT `klien_profiles_pt_id_pt_profiles_id_fk` FOREIGN KEY (`pt_id`) REFERENCES `pt_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admin_profiles` ADD CONSTRAINT `admin_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pairing_requests` ADD CONSTRAINT `pairing_requests_klien_id_klien_profiles_id_fk` FOREIGN KEY (`klien_id`) REFERENCES `klien_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pairing_requests` ADD CONSTRAINT `pairing_requests_pt_id_pt_profiles_id_fk` FOREIGN KEY (`pt_id`) REFERENCES `pt_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weight_logs` ADD CONSTRAINT `weight_logs_klien_id_klien_profiles_id_fk` FOREIGN KEY (`klien_id`) REFERENCES `klien_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `progress_cycles` ADD CONSTRAINT `progress_cycles_klien_id_klien_profiles_id_fk` FOREIGN KEY (`klien_id`) REFERENCES `klien_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `weekly_plans` ADD CONSTRAINT `weekly_plans_klien_id_klien_profiles_id_fk` FOREIGN KEY (`klien_id`) REFERENCES `klien_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_klien_id_klien_profiles_id_fk` FOREIGN KEY (`klien_id`) REFERENCES `klien_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_weekly_plan_id_weekly_plans_id_fk` FOREIGN KEY (`weekly_plan_id`) REFERENCES `weekly_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_olahraga_id_master_olahraga_id_fk` FOREIGN KEY (`olahraga_id`) REFERENCES `master_olahraga`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_logs` ADD CONSTRAINT `meal_logs_klien_id_klien_profiles_id_fk` FOREIGN KEY (`klien_id`) REFERENCES `klien_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_logs` ADD CONSTRAINT `meal_logs_weekly_plan_id_weekly_plans_id_fk` FOREIGN KEY (`weekly_plan_id`) REFERENCES `weekly_plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meal_logs` ADD CONSTRAINT `meal_logs_makanan_id_master_makanan_id_fk` FOREIGN KEY (`makanan_id`) REFERENCES `master_makanan`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_klien_id_klien_profiles_id_fk` FOREIGN KEY (`klien_id`) REFERENCES `klien_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feedbacks` ADD CONSTRAINT `feedbacks_pt_id_pt_profiles_id_fk` FOREIGN KEY (`pt_id`) REFERENCES `pt_profiles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admin_activity_logs` ADD CONSTRAINT `admin_activity_logs_admin_id_users_id_fk` FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admin_activity_logs` ADD CONSTRAINT `admin_activity_logs_target_user_id_users_id_fk` FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_klien_profiles_pt_id` ON `klien_profiles` (`pt_id`);--> statement-breakpoint
CREATE INDEX `idx_pairing_requests_klien_id` ON `pairing_requests` (`klien_id`);--> statement-breakpoint
CREATE INDEX `idx_pairing_requests_pt_id` ON `pairing_requests` (`pt_id`);--> statement-breakpoint
CREATE INDEX `idx_weight_logs_klien_tanggal` ON `weight_logs` (`klien_id`,`tanggal`);--> statement-breakpoint
CREATE INDEX `idx_progress_cycles_klien_status` ON `progress_cycles` (`klien_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_activity_logs_klien_tanggal` ON `activity_logs` (`klien_id`,`tanggal`);--> statement-breakpoint
CREATE INDEX `idx_meal_logs_klien_tanggal` ON `meal_logs` (`klien_id`,`tanggal`);