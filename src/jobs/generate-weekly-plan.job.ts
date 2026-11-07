import { and, eq, isNotNull, desc } from "drizzle-orm";
import { db } from "../config/db";
import { klienProfiles, progressCycles, ptProfiles, weightLogs, weeklyPlans } from "../db/schema";
import { generateWeeklyPlan } from "../modules/ai/weekly-plan";
import { getStartOfWeekUtc } from "../utils/week";

type GenerateOptions = {
  // Batasi jumlah klien yang diproses per trigger (agar tidak timeout di serverless).
  limit?: number;
  // Proses hanya satu klien (backfill/demo).
  klienId?: number;
};

// Dipanggil oleh: endpoint /internal/jobs/generate-weekly-plan (cron-job.org di production).
export async function generateWeeklyPlanForAllActiveKlien(options: GenerateOptions = {}) {
  const { limit, klienId } = options;
  const startOfWeek = getStartOfWeekUtc();

  const filters = [isNotNull(klienProfiles.ptId)];
  if (klienId !== undefined) filters.push(eq(klienProfiles.id, klienId));

  const klienList = await db
    .select()
    .from(klienProfiles)
    .where(and(...filters));

  let count = 0;
  let attempts = 0;

  for (const klien of klienList) {
    if (limit !== undefined && attempts >= limit) break;

    const [cycle] = await db
      .select()
      .from(progressCycles)
      .where(and(eq(progressCycles.klienId, klien.id), eq(progressCycles.status, "aktif")))
      .limit(1);
    if (!cycle || !klien.ptId) continue;

    const [pt] = await db.select().from(ptProfiles).where(eq(ptProfiles.id, klien.ptId)).limit(1);
    if (!pt?.tempatGym) continue; // PT belum lengkapi profil, skip dulu

    const existingPlan = await db
      .select()
      .from(weeklyPlans)
      .where(and(eq(weeklyPlans.klienId, klien.id), eq(weeklyPlans.mingguMulai, startOfWeek)))
      .limit(1);
    if (existingPlan.length > 0) continue; // sudah ada plan minggu ini

    const [latestWeight] = await db
      .select()
      .from(weightLogs)
      .where(eq(weightLogs.klienId, klien.id))
      .orderBy(desc(weightLogs.tanggal))
      .limit(1);

    attempts += 1;

    try {
      // generateWeeklyPlan sudah punya timeout + fallback deterministik di dalamnya.
      const plan = await generateWeeklyPlan({
        tinggiBadanCm: klien.tinggiBadanCm,
        alergiMakanan: klien.alergiMakanan,
        bbAwalKg: cycle.bbAwalKg,
        bbSekarangKg: latestWeight?.beratBadanKg ?? cycle.bbAwalKg,
        bbTujuanKg: cycle.bbTujuanKg,
        tujuan: cycle.tujuan,
        tempatGym: pt.tempatGym,
      });

      await db.insert(weeklyPlans).values({
        klienId: klien.id,
        mingguMulai: startOfWeek,
        workoutPlan: plan.workoutPlan,
        mealPlan: plan.mealPlan,
        status: "pending_review",
      });
      count += 1;
    } catch (err) {
      // Satu klien gagal tidak boleh menggagalkan seluruh job.
      console.error(`Gagal generate weekly plan untuk klien ${klien.id}:`, err);
    }
  }

  console.log(
    `generateWeeklyPlanForAllActiveKlien: ${count} plan digenerate (attempts ${attempts})`
  );
  return count;
}
