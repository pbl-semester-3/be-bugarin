import { mysqlTable, int, varchar, boolean, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 191 }).notNull().unique(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  // Google ID (sub) untuk login OAuth. Nullable; banyak NULL diperbolehkan di MySQL.
  googleId: varchar("google_id", { length: 255 }).unique(),
  role: mysqlEnum("role", ["klien", "pt", "admin"]).notNull(),
  // false = akun di-suspend (tidak bisa login & ditolak authGuard), tetap tampil di daftar admin.
  isActive: boolean("is_active").notNull().default(true),
  // Soft-delete (admin): terisi = akun dihapus dari daftar admin (isActive juga false).
  deletedAt: timestamp("deleted_at"),
  tema: mysqlEnum("tema", ["siang", "malam"]).notNull().default("siang"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
