import { mysqlTable, int, text, boolean, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { klienProfiles } from "./klien-profiles";
import { ptProfiles } from "./pt-profiles";

export const feedbacks = mysqlTable("feedbacks", {
  id: int("id").autoincrement().primaryKey(),
  klienId: int("klien_id").notNull().references(() => klienProfiles.id),
  // Nullable — null kalau source = 'ai'.
  ptId: int("pt_id").references(() => ptProfiles.id),
  source: mysqlEnum("source", ["ai", "pt"]).notNull(),
  pesan: text("pesan").notNull(),
  // Hanya boleh diisi SEKALI per baris (bukan chat berkelanjutan) — divalidasi di level service.
  balasanKlien: text("balasan_klien"),
  dibaca: boolean("dibaca").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
  klien: one(klienProfiles, { fields: [feedbacks.klienId], references: [klienProfiles.id] }),
  pt: one(ptProfiles, { fields: [feedbacks.ptId], references: [ptProfiles.id] }),
}));

export type Feedback = typeof feedbacks.$inferSelect;
export type NewFeedback = typeof feedbacks.$inferInsert;
