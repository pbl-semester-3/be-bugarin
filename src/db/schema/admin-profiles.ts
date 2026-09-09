import { mysqlTable, int, varchar } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const adminProfiles = mysqlTable("admin_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique().references(() => users.id),
  nama: varchar("nama", { length: 100 }).notNull(),
});

export const adminProfilesRelations = relations(adminProfiles, ({ one }) => ({
  user: one(users, { fields: [adminProfiles.userId], references: [users.id] }),
}));

export type AdminProfile = typeof adminProfiles.$inferSelect;
export type NewAdminProfile = typeof adminProfiles.$inferInsert;
