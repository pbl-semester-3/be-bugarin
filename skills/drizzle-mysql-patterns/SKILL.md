---
name: drizzle-mysql-patterns
description: Pola schema, migration, relasi, transaksi, dan indexing Drizzle ORM untuk MySQL, disesuaikan dengan ERD Bugarin (14 entitas). Gunakan saat menulis atau mengubah schema database, query, atau migration.
metadata:
  origin: bugarin-project
  adapted_from: ECC mysql-patterns, prisma-patterns (MIT license, https://github.com/affaan-m/ECC)
---

# Drizzle ORM + MySQL Patterns (Bugarin)

Rujuk `bugarin_erd.mermaid` untuk skema lengkap. Skill ini fokus ke cara menerjemahkan ERD itu jadi kode Drizzle yang benar, plus pola query yang sering dipakai di Bugarin (cek goal tercapai, streak OR logic, dsb).

## Activation

- Menulis schema Drizzle baru (`db/schema/*.ts`) dari entitas di ERD.
- Membuat/mengubah migration.
- Menulis query yang melibatkan JOIN, transaksi, atau agregasi (mis. streak, riwayat per siklus).

## Setup Koneksi (mysql2)

```typescript
// config/db.ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../db/schema";
import { env } from "./env";

const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

export const db = drizzle(pool, { schema, mode: "default" });
```

Jaga `connectionLimit` di bawah `wait_timeout` server MySQL. Untuk PBL dengan traffic kecil, 10 koneksi lebih dari cukup — jangan set terlalu tinggi tanpa alasan.

## Contoh Schema (mengikuti pola ERD Bugarin)

```typescript
// db/schema/klien-profiles.ts
import { mysqlTable, int, varchar, text, float, mysqlEnum } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { ptProfiles } from "./pt-profiles";

export const klienProfiles = mysqlTable("klien_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id),
  nama: varchar("nama", { length: 100 }).notNull(),
  usia: int("usia"), // nullable — diisi belakangan saat Onboarding, bukan saat register
  jenisKelamin: mysqlEnum("jenis_kelamin", ["pria", "wanita"]), // nullable, idem
  alergiMakanan: text("alergi_makanan"),
  tinggiBadanCm: float("tinggi_badan_cm").notNull(),
  ptId: int("pt_id").references(() => ptProfiles.id), // nullable, PT aktif saat ini
});

export const klienProfilesRelations = relations(klienProfiles, ({ one, many }) => ({
  user: one(users, { fields: [klienProfiles.userId], references: [users.id] }),
  pt: one(ptProfiles, { fields: [klienProfiles.ptId], references: [ptProfiles.id] }),
}));
```

```typescript
// db/schema/progress-cycles.ts
import { mysqlTable, int, float, date, mysqlEnum, index } from "drizzle-orm/mysql-core";
import { klienProfiles } from "./klien-profiles";

export const progressCycles = mysqlTable("progress_cycles", {
  id: int("id").autoincrement().primaryKey(),
  klienId: int("klien_id").notNull().references(() => klienProfiles.id),
  bbAwalKg: float("bb_awal_kg").notNull(),
  bbTujuanKg: float("bb_tujuan_kg").notNull(),
  tujuan: mysqlEnum("tujuan", ["turun_bb", "naik_bb"]).notNull(),
  durasiHari: int("durasi_hari").notNull(),
  targetKaloriPerHari: int("target_kalori_per_hari").notNull(),
  status: mysqlEnum("status", ["aktif", "selesai"]).notNull().default("aktif"),
  tanggalMulai: date("tanggal_mulai").notNull(),
  tanggalSelesai: date("tanggal_selesai"),
}, (table) => ({
  // dipakai tiap load Dashboard/Profil — index wajib
  klienStatusIdx: index("idx_progress_cycles_klien_status").on(table.klienId, table.status),
}));
```

`weekly_plans.workout_plan` dan `meal_plan` disimpan sebagai `json`:

```typescript
// db/schema/weekly-plans.ts
import { json, mysqlEnum } from "drizzle-orm/mysql-core";

export const weeklyPlans = mysqlTable("weekly_plans", {
  // ...id, klienId, minggu_mulai...
  workoutPlan: json("workout_plan").$type<WorkoutPlanItem[]>().notNull(),
  mealPlan: json("meal_plan").$type<MealPlanItem[]>().notNull(),
  status: mysqlEnum("status", ["pending_review", "disetujui", "override"]).notNull(),
});
```

Definisikan `WorkoutPlanItem`/`MealPlanItem` sebagai TypeScript type di file yang sama dan **jangan** duplikasi definisi shape ini di modul `ai/` — import dari sini supaya output Gemini API dan kolom JSON selalu sinkron tipenya.

## Migration Workflow

```bash
npx drizzle-kit generate   # generate SQL migration dari perubahan schema/*.ts
npx drizzle-kit migrate    # jalankan migration ke database
```

- **Jangan** edit file migration yang sudah di-generate secara manual kecuali darurat — ubah schema source, generate ulang.
- Review file migration hasil generate sebelum dijalankan ke database bersama (cek index, foreign key, default value sesuai maksud).
- Satu migration = satu perubahan logis (jangan gabung "tambah kolom tempat_gym" dengan "buat tabel progress_cycles" dalam satu migration kalau bisa dipisah, memudahkan rollback).

## Query Patterns Spesifik Bugarin

### Streak (logika OR)
```typescript
import { sql, and, eq } from "drizzle-orm";

const today = new Date().toISOString().slice(0, 10);
const hasActivity = await db.select().from(activityLogs)
  .where(and(eq(activityLogs.klienId, klienId), eq(activityLogs.tanggal, today)));
const hasMeal = await db.select().from(mealLogs)
  .where(and(eq(mealLogs.klienId, klienId), eq(mealLogs.tanggal, today)));

const streakHariIniValid = hasActivity.length > 0 || hasMeal.length > 0;
```
Untuk hitung streak berturut-turut, loop mundur per tanggal di level aplikasi (bukan single query SQL) — lebih mudah dibaca dan cukup cepat untuk skala data PBL.

### Cek Goal Tercapai (dipanggil setelah insert `weight_logs`)
```typescript
const [cycle] = await db.select().from(progressCycles)
  .where(and(eq(progressCycles.klienId, klienId), eq(progressCycles.status, "aktif")));

const tercapai = cycle.tujuan === "turun_bb"
  ? bbBaru <= cycle.bbTujuanKg
  : bbBaru >= cycle.bbTujuanKg;

if (tercapai) {
  await db.update(progressCycles)
    .set({ status: "selesai", tanggalSelesai: sql`CURRENT_DATE()` })
    .where(eq(progressCycles.id, cycle.id));
}
```

### Transaksi (mulai siklus baru — tutup cycle lama + buat baru harus atomik)
```typescript
await db.transaction(async (tx) => {
  await tx.update(progressCycles)
    .set({ status: "selesai", tanggalSelesai: sql`CURRENT_DATE()` })
    .where(and(eq(progressCycles.klienId, klienId), eq(progressCycles.status, "aktif")));

  await tx.insert(progressCycles).values({
    klienId, bbAwalKg, bbTujuanKg, tujuan, durasiHari, targetKaloriPerHari,
    status: "aktif",
    tanggalMulai: sql`CURRENT_DATE()`,
  });
});
```

### Master Makanan Dinamis (get-or-create)
```typescript
const existing = await db.select().from(masterMakanan)
  .where(eq(masterMakanan.nama, namaInput)).limit(1);

const makanan = existing[0] ?? await (async () => {
  const estimasi = await estimateFoodCalories(namaInput); // panggil modul ai/
  const [inserted] = await db.insert(masterMakanan).values({
    nama: namaInput,
    kaloriPer100g: estimasi.kaloriPer100g,
    kategori: estimasi.kategori,
    sumber: "ai_generated",
  }).$returningId();
  return { ...inserted };
})();
```

## Indexing Checklist (sesuai requirement kampus)

| Tabel | Index |
|---|---|
| `klien_profiles` | `pt_id` |
| `progress_cycles` | composite `(klien_id, status)` |
| `pairing_requests` | `klien_id`, `pt_id` |
| `weight_logs` | composite `(klien_id, tanggal)` |
| `activity_logs` | composite `(klien_id, tanggal)` |
| `meal_logs` | composite `(klien_id, tanggal)` |
| `master_makanan` | UNIQUE `nama` |
| `master_olahraga` | UNIQUE `nama` |

## Anti-Patterns

| Anti-Pattern | Risiko | Perbaikan |
|---|---|---|
| Hitung ulang `kalori_terbakar`/`kalori_masuk` tiap kali dibaca | Histori berubah kalau data master di-update | Hitung & simpan (snapshot) saat insert |
| Tutup cycle lama & insert cycle baru tanpa transaction | Race condition, bisa ada 2 cycle `aktif` bersamaan | Bungkus `db.transaction()` |
| `SELECT *` lalu filter di JS | Over-fetch, index tidak kepakai optimal | Select kolom eksplisit + `WHERE` di query |
| Definisikan ulang shape `workout_plan` di modul `ai/` terpisah dari schema | Tipe bisa drift dari kolom JSON asli | Import type dari `db/schema/weekly-plans.ts` |

## Related

- Skill: `express-typescript-patterns` — layering service yang memanggil query ini
- Skill: `gemini-structured-output` — sumber data untuk get-or-create master_makanan
