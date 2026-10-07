import { mysqlTable, int, varchar, text, float, mysqlEnum, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { progressCycles } from "./progress-cycles";
import { users } from "./users";
import { ptProfiles } from "./pt-profiles";

export const klienProfiles = mysqlTable("klien_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique().references(() => users.id),
  nama: varchar("nama", { length: 100 }).notNull(), // diisi saat register
  // Field di bawah ini nullable — diisi belakangan saat Onboarding (lihat Bugarin_PRD_Mobile.md bab 3.2).
  // "Profil lengkap" = usia, jenisKelamin, tinggiBadanCm semua terisi DAN punya progress_cycles aktif.
  usia: int("usia"),
  jenisKelamin: mysqlEnum("jenis_kelamin", ["pria", "wanita"]),
  alergiMakanan: text("alergi_makanan"),
  tinggiBadanCm: float("tinggi_badan_cm"),
  // PT aktif saat ini — nullable, kosong sebelum klien punya PT (lihat pairing_requests).
  ptId: int("pt_id").references(() => ptProfiles.id),
  // public_id Cloudinary (bukan URL absolut). URL dibangun saat response. Nullable = belum ada foto.
  fotoPublicId: varchar("foto_public_id", { length: 255 }),
}, (table) => ({
  ptIdIdx: index("idx_klien_profiles_pt_id").on(table.ptId),
}));

export const klienProfilesRelations = relations(klienProfiles, ({ one, many }) => ({
  user: one(users, { fields: [klienProfiles.userId], references: [users.id] }),
  pt: one(ptProfiles, { fields: [klienProfiles.ptId], references: [ptProfiles.id] }),
  progressCycles: many(progressCycles),
}));

export type KlienProfile = typeof klienProfiles.$inferSelect;
export type NewKlienProfile = typeof klienProfiles.$inferInsert;
