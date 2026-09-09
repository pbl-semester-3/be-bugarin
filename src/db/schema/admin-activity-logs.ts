import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const adminActivityLogs = mysqlTable("admin_activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("admin_id").notNull().references(() => users.id),
  aksi: varchar("aksi", { length: 255 }).notNull(), // mis. "create_pt", "delete_klien"
  targetUserId: int("target_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminActivityLogsRelations = relations(adminActivityLogs, ({ one }) => ({
  admin: one(users, { fields: [adminActivityLogs.adminId], references: [users.id] }),
}));

export type AdminActivityLog = typeof adminActivityLogs.$inferSelect;
export type NewAdminActivityLog = typeof adminActivityLogs.$inferInsert;
