import { mysqlTable, int, varchar, float, boolean, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";

export const masterOlahraga = mysqlTable("master_olahraga", {
  id: int("id").autoincrement().primaryKey(),
  nama: varchar("nama", { length: 100 }).notNull().unique(),
  // Metabolic Equivalent of Task — dipakai rumus: kalori = metValue x beratBadanKg x (durasiMenit / 60)
  metValue: float("met_value").notNull(),
  kategori: mysqlEnum("kategori", ["kardio", "kekuatan", "fleksibilitas"]).notNull(),
  // Menentukan apakah field jarak tampil di form Progres — data-driven, bukan hardcode di frontend.
  butuhJarak: boolean("butuh_jarak").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MasterOlahraga = typeof masterOlahraga.$inferSelect;
export type NewMasterOlahraga = typeof masterOlahraga.$inferInsert;
