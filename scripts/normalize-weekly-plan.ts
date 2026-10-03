/**
 * CARA MENJALANKAN:
 * npm run db:normalize-weekly-plan
 *
 * Normalisasi sekali pakai untuk kolom `weekly_plans.minggu_mulai`.
 * Latar belakang: sebelumnya ada 4 rumus awal minggu yang berbeda; cron menyimpan
 * tanggal hari eksekusi (bukan Senin) dan startNewProgressCycle salah saat hari Minggu.
 * Setelah reader memakai exact-match Senin, baris lama yang salah jadi tidak terbaca.
 *
 * Aksi: untuk tiap (klien_id, Senin-hasil-normalisasi), sisakan baris TERBARU
 * (generated_at DESC, id DESC), pindahkan referensi log ke baris keep, lalu hapus
 * baris duplikat/lama. Jalankan sekali setelah perubahan kode awal minggu.
 */
import { db } from "../src/config/db";
import { weeklyPlans, activityLogs, mealLogs } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { getMondayOfDateStringUtc } from "../src/utils/week";

type Row = typeof weeklyPlans.$inferSelect;

async function normalize() {
  const rows = await db.select().from(weeklyPlans);
  console.log(`Ditemukan ${rows.length} baris weekly_plans.`);

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const monday = getMondayOfDateStringUtc(row.mingguMulai);
    const key = `${row.klienId}|${monday}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  let updated = 0;
  let deleted = 0;

  for (const [key, bucket] of groups) {
    const monday = key.split("|")[1];
    const sorted = [...bucket].sort((a, b) => {
      const diff = b.generatedAt.getTime() - a.generatedAt.getTime();
      return diff !== 0 ? diff : b.id - a.id;
    });
    const keep = sorted[0];
    const drops = sorted.slice(1);

    await db.transaction(async (tx) => {
      if (keep.mingguMulai !== monday) {
        await tx.update(weeklyPlans).set({ mingguMulai: monday }).where(eq(weeklyPlans.id, keep.id));
        updated++;
      }

      for (const drop of drops) {
        await tx.update(activityLogs).set({ weeklyPlanId: keep.id }).where(eq(activityLogs.weeklyPlanId, drop.id));
        await tx.update(mealLogs).set({ weeklyPlanId: keep.id }).where(eq(mealLogs.weeklyPlanId, drop.id));
        await tx.delete(weeklyPlans).where(eq(weeklyPlans.id, drop.id));
        deleted++;
      }
    });
  }

  console.log(`Selesai. Baris minggu_mulai diperbaiki: ${updated}, baris duplikat/lama dihapus: ${deleted}.`);
  process.exit(0);
}

normalize().catch((error) => {
  console.error("Normalisasi gagal:", error);
  process.exit(1);
});
