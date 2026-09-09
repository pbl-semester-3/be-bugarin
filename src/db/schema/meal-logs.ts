import { mysqlTable, int, float, date, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { klienProfiles } from "./klien-profiles";
import { weeklyPlans } from "./weekly-plans";
import { masterMakanan } from "./master-makanan";

export const mealLogs = mysqlTable("meal_logs", {
  id: int("id").autoincrement().primaryKey(),
  klienId: int("klien_id").notNull().references(() => klienProfiles.id),
  weeklyPlanId: int("weekly_plan_id").references(() => weeklyPlans.id),
  makananId: int("makanan_id").notNull().references(() => masterMakanan.id),
  porsiGram: float("porsi_gram").notNull(),
  // Snapshot hasil kalori_per_100g x (porsi/100) saat insert.
  kaloriMasuk: int("kalori_masuk").notNull(),
  tanggal: date("tanggal", { mode: "string" }).notNull(),
}, (table) => ({
  klienTanggalIdx: index("idx_meal_logs_klien_tanggal").on(table.klienId, table.tanggal),
}));

export const mealLogsRelations = relations(mealLogs, ({ one }) => ({
  klien: one(klienProfiles, { fields: [mealLogs.klienId], references: [klienProfiles.id] }),
  weeklyPlan: one(weeklyPlans, { fields: [mealLogs.weeklyPlanId], references: [weeklyPlans.id] }),
  makanan: one(masterMakanan, { fields: [mealLogs.makananId], references: [masterMakanan.id] }),
}));

export type MealLog = typeof mealLogs.$inferSelect;
export type NewMealLog = typeof mealLogs.$inferInsert;
