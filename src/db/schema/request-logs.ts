import { mysqlTable, int, varchar, mysqlEnum, timestamp, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// Log error per request (status >= 400) untuk penelusuran via request ID.
// Hanya error yang disimpan (bukan semua request) agar volume tetap kecil.
export const requestLogs = mysqlTable("request_logs", {
  id: int("id").autoincrement().primaryKey(),
  requestId: varchar("request_id", { length: 100 }).notNull(),
  userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
  role: mysqlEnum("role", ["klien", "pt", "admin"]),
  method: varchar("method", { length: 10 }).notNull(),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  status: int("status").notNull(),
  message: varchar("message", { length: 255 }),
  durationMs: int("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  requestIdIdx: index("idx_request_logs_request_id").on(table.requestId),
  createdAtIdx: index("idx_request_logs_created_at").on(table.createdAt),
  statusIdx: index("idx_request_logs_status").on(table.status),
}));

export const requestLogsRelations = relations(requestLogs, ({ one }) => ({
  user: one(users, { fields: [requestLogs.userId], references: [users.id] }),
}));

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
