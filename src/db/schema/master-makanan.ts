import { mysqlTable, int, varchar, float, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";

export const masterMakanan = mysqlTable("master_makanan", {
  id: int("id").autoincrement().primaryKey(),
  nama: varchar("nama", { length: 150 }).notNull().unique(),
  kaloriPer100g: float("kalori_per_100g").notNull(),
  kategori: mysqlEnum("kategori", ["karbohidrat", "protein", "sayur", "lainnya"]).notNull(),
  // "seed" = data awal dev, "ai_generated" = hasil estimasi Gemini saat klien input menu custom
  // yang belum ada (lihat bugarin_schema_notes.md bab 5 — juga mitigasi AI hallucination).
  sumber: mysqlEnum("sumber", ["seed", "ai_generated"]).notNull().default("seed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MasterMakanan = typeof masterMakanan.$inferSelect;
export type NewMasterMakanan = typeof masterMakanan.$inferInsert;
