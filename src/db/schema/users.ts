import { mysqlTable, int, varchar, mysqlEnum, timestamp } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 191 }).notNull().unique(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  // Google ID (sub) untuk login OAuth. Nullable; banyak NULL diperbolehkan di MySQL.
  googleId: varchar("google_id", { length: 255 }).unique(),
  role: mysqlEnum("role", ["klien", "pt", "admin"]).notNull(),
  tema: mysqlEnum("tema", ["siang", "malam"]).notNull().default("siang"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
