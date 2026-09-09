import { mysqlTable, int, text, mysqlEnum, timestamp, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { klienProfiles } from "./klien-profiles";
import { ptProfiles } from "./pt-profiles";

export const pairingRequests = mysqlTable("pairing_requests", {
  id: int("id").autoincrement().primaryKey(),
  klienId: int("klien_id").notNull().references(() => klienProfiles.id),
  ptId: int("pt_id").notNull().references(() => ptProfiles.id),
  status: mysqlEnum("status", ["pending", "diterima", "ditolak"]).notNull().default("pending"),
  alasanPenolakan: text("alasan_penolakan"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  klienIdIdx: index("idx_pairing_requests_klien_id").on(table.klienId),
  ptIdIdx: index("idx_pairing_requests_pt_id").on(table.ptId),
}));

export const pairingRequestsRelations = relations(pairingRequests, ({ one }) => ({
  klien: one(klienProfiles, { fields: [pairingRequests.klienId], references: [klienProfiles.id] }),
  pt: one(ptProfiles, { fields: [pairingRequests.ptId], references: [ptProfiles.id] }),
}));

export type PairingRequest = typeof pairingRequests.$inferSelect;
export type NewPairingRequest = typeof pairingRequests.$inferInsert;
