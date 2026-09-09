import { mysqlTable, int, float, date, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { klienProfiles } from "./klien-profiles";

export const weightLogs = mysqlTable("weight_logs", {
  id: int("id").autoincrement().primaryKey(),
  klienId: int("klien_id").notNull().references(() => klienProfiles.id),
  beratBadanKg: float("berat_badan_kg").notNull(),
  tanggal: date("tanggal", { mode: "string" }).notNull(),
}, (table) => ({
  // Composite index — dipakai untuk ambil entry terakhir per klien (ORDER BY tanggal DESC).
  klienTanggalIdx: index("idx_weight_logs_klien_tanggal").on(table.klienId, table.tanggal),
}));

export const weightLogsRelations = relations(weightLogs, ({ one }) => ({
  klien: one(klienProfiles, { fields: [weightLogs.klienId], references: [klienProfiles.id] }),
}));

export type WeightLog = typeof weightLogs.$inferSelect;
export type NewWeightLog = typeof weightLogs.$inferInsert;
