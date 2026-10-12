import { mysqlTable, int, varchar, mysqlEnum } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const ptProfiles = mysqlTable("pt_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique().references(() => users.id),
  nama: varchar("nama", { length: 100 }).notNull(), // diisi Admin saat create akun
  // Field di bawah ini nullable — wajib dilengkapi PT sendiri saat login pertama
  // (lihat Bugarin_PRD_Backend_AI.md 4.2 & jwt-auth-security bab Users & Role).
  usia: int("usia"),
  jenisKelamin: mysqlEnum("jenis_kelamin", ["pria", "wanita"]),
  spesialisasi: mysqlEnum("spesialisasi", ["turun_bb", "naik_bb"]),
  tempatGym: varchar("tempat_gym", { length: 150 }),
  // public_id Cloudinary (bukan URL absolut). URL dibangun saat response. Nullable = belum ada foto.
  fotoPublicId: varchar("foto_public_id", { length: 255 }),
});

export const ptProfilesRelations = relations(ptProfiles, ({ one }) => ({
  user: one(users, { fields: [ptProfiles.userId], references: [users.id] }),
}));

export type PtProfile = typeof ptProfiles.$inferSelect;
export type NewPtProfile = typeof ptProfiles.$inferInsert;
