ALTER TABLE `master_olahraga` ADD `butuh_beban` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD `berat_beban_kg` float;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD `jumlah_set` int;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD `repetisi` int;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD `waktu_istirahat_detik` int;