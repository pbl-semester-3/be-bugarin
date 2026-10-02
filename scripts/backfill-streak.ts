/**
 * CARA MENJALANKAN:
 * npm run db:backfill-streak
 *
 * Backfill satu kali: hitung ulang `progress_cycles.streak` untuk SEMUA cycle (aktif maupun
 * selesai) dari histori `activity_logs` + `meal_logs` di dalam window masing-masing cycle.
 * Jalankan setelah `npm run db:migrate`.
 */
import { db } from "../src/config/db";
import { progressCycles, activityLogs, mealLogs } from "../src/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

async function backfill() {
  const today = new Date().toISOString().slice(0, 10);
  const cycles = await db.select().from(progressCycles);
  console.log(`Ditemukan ${cycles.length} cycle untuk di-backfill.`);

  for (const cycle of cycles) {
    const akhir =
      cycle.status === "selesai" && cycle.tanggalSelesai ? cycle.tanggalSelesai : today;

    const activityRows = await db
      .selectDistinct({ tanggal: activityLogs.tanggal })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.klienId, cycle.klienId),
          gte(activityLogs.tanggal, cycle.tanggalMulai),
          lte(activityLogs.tanggal, akhir),
        ),
      );

    const mealRows = await db
      .selectDistinct({ tanggal: mealLogs.tanggal })
      .from(mealLogs)
      .where(
        and(
          eq(mealLogs.klienId, cycle.klienId),
          gte(mealLogs.tanggal, cycle.tanggalMulai),
          lte(mealLogs.tanggal, akhir),
        ),
      );

    const distinctDates = new Set<string>();
    for (const row of activityRows) distinctDates.add(row.tanggal);
    for (const row of mealRows) distinctDates.add(row.tanggal);

    const streak = distinctDates.size;
    await db.update(progressCycles).set({ streak }).where(eq(progressCycles.id, cycle.id));
    console.log(
      `cycle ${cycle.id} (klien ${cycle.klienId}, ${cycle.tanggalMulai}..${akhir}, ${cycle.status}): streak = ${streak}`,
    );
  }

  console.log("Backfill streak selesai.");
  process.exit(0);
}

backfill().catch((error) => {
  console.error("Backfill gagal:", error);
  process.exit(1);
});
