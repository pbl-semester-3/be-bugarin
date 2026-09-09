import { mysqlTable, int, json, date, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { klienProfiles } from "./klien-profiles";

// Shape JSON hasil generate AI (Gemini). Import type ini dari sini di modul ai/ dan
// jangan didefinisikan ulang di tempat lain — supaya tidak drift dari kolom JSON asli
// (lihat skill drizzle-mysql-patterns).
export type WorkoutPlanItem = {
  hari: string;
  jam: string;
  jenis: string;
  lokasi: string; // diisi backend dari pt_profiles.tempat_gym, BUKAN diminta ke AI
};

export type MealPlanItem = {
  waktu: string;
  menu: string;
  estimasiKalori: number;
};

export const weeklyPlans = mysqlTable("weekly_plans", {
  id: int("id").autoincrement().primaryKey(),
  klienId: int("klien_id").notNull().references(() => klienProfiles.id),
  mingguMulai: date("minggu_mulai", { mode: "string" }).notNull(),
  workoutPlan: json("workout_plan").$type<WorkoutPlanItem[]>().notNull(),
  mealPlan: json("meal_plan").$type<MealPlanItem[]>().notNull(),
  status: mysqlEnum("status", ["pending_review", "disetujui", "override"]).notNull().default("pending_review"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const weeklyPlansRelations = relations(weeklyPlans, ({ one }) => ({
  klien: one(klienProfiles, { fields: [weeklyPlans.klienId], references: [klienProfiles.id] }),
}));

export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type NewWeeklyPlan = typeof weeklyPlans.$inferInsert;
