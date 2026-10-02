import { mysqlTable, int, float, date, mysqlEnum, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { klienProfiles } from "./klien-profiles";

export const progressCycles = mysqlTable("progress_cycles", {
  id: int("id").autoincrement().primaryKey(),
  klienId: int("klien_id").notNull().references(() => klienProfiles.id),
  bbAwalKg: float("bb_awal_kg").notNull(),
  bbTujuanKg: float("bb_tujuan_kg").notNull(),
  tujuan: mysqlEnum("tujuan", ["turun_bb", "naik_bb"]).notNull(),
  // Informasi target waktu saja — BUKAN trigger penutupan paksa (lihat bugarin_schema_notes.md bab 3).
  durasiHari: int("durasi_hari").notNull(),
  targetKaloriPerHari: int("target_kalori_per_hari").notNull(),
  // Total hari unik (activity_logs OR meal_logs) dalam window siklus. Tidak pernah reset
  // selama siklus berjalan; mulai 0 saat siklus baru dibuat. Lihat CATATAN.md.
  streak: int("streak").notNull().default(0),
  status: mysqlEnum("status", ["aktif", "selesai"]).notNull().default("aktif"),
  tanggalMulai: date("tanggal_mulai", { mode: "string" }).notNull(),
  tanggalSelesai: date("tanggal_selesai", { mode: "string" }),
}, (table) => ({
  // Dipakai tiap load Dashboard/Profil untuk cari cycle aktif klien.
  klienStatusIdx: index("idx_progress_cycles_klien_status").on(table.klienId, table.status),
}));

export const progressCyclesRelations = relations(progressCycles, ({ one }) => ({
  klien: one(klienProfiles, { fields: [progressCycles.klienId], references: [klienProfiles.id] }),
}));

export type ProgressCycle = typeof progressCycles.$inferSelect;
export type NewProgressCycle = typeof progressCycles.$inferInsert;
