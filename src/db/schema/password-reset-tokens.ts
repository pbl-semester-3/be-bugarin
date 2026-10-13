import { mysqlTable, int, varchar, timestamp, index } from "drizzle-orm/mysql-core";
import { users } from "./users";

// Token reset sandi klien: kode 6 digit disimpan sebagai HASH (argon2), TTL 15 menit,
// sekali pakai. Kode lama yang belum dipakai di-invalidate saat request baru.
export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kodeHash: varchar("kode_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("idx_password_reset_tokens_user").on(table.userId),
}));

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
