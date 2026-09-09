import { mysqlTable, int, float, date, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { klienProfiles } from "./klien-profiles";
import { weeklyPlans } from "./weekly-plans";
import { masterOlahraga } from "./master-olahraga";

export const activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  klienId: int("klien_id").notNull().references(() => klienProfiles.id),
  // Nullable: diisi kalau log berasal dari item Weekly Plan (checklist), kosong kalau input manual di luar plan.
  weeklyPlanId: int("weekly_plan_id").references(() => weeklyPlans.id),
  olahragaId: int("olahraga_id").notNull().references(() => masterOlahraga.id),
  durasiMenit: int("durasi_menit").notNull(),
  jarakMeter: float("jarak_meter"), // hanya diisi kalau master_olahraga.butuh_jarak = true
  // Snapshot hasil rumus MET saat insert — TIDAK dihitung ulang saat dibaca (lihat drizzle-mysql-patterns).
  kaloriTerbakar: int("kalori_terbakar").notNull(),
  tanggal: date("tanggal", { mode: "string" }).notNull(),
}, (table) => ({
  klienTanggalIdx: index("idx_activity_logs_klien_tanggal").on(table.klienId, table.tanggal),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  klien: one(klienProfiles, { fields: [activityLogs.klienId], references: [klienProfiles.id] }),
  weeklyPlan: one(weeklyPlans, { fields: [activityLogs.weeklyPlanId], references: [weeklyPlans.id] }),
  olahraga: one(masterOlahraga, { fields: [activityLogs.olahragaId], references: [masterOlahraga.id] }),
}));

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
