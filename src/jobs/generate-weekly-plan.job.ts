import { and, eq, isNotNull, desc, sql } from "drizzle-orm";
import { db } from "../config/db";
import { klienProfiles, progressCycles, ptProfiles, weightLogs, weeklyPlans } from "../db/schema";
import { generateWeeklyPlan } from "../modules/ai/weekly-plan";
import { getOccupiedWorkoutSlots } from "../utils/schedule-data";
import { getStartOfWeekUtc } from "../utils/week";

type GenerateOptions = {
  // Batasi jumlah klien yang diproses per trigger (agar tidak timeout di serverless).
  limit?: number;
  // Proses hanya satu klien (backfill/demo).
  klienId?: number;
};

type GenerateResult = {
  count: number;
  remaining: number;
  total: number;
};

// Dipanggil oleh: endpoint /internal/jobs/generate-weekly-plan (cron-job.org di production).
export async function generateWeeklyPlanForAllActiveKlien(
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const { limit, klienId } = options;
  const startOfWeek = getStartOfWeekUtc();

  const where =
    klienId !== undefined
      ? and(isNotNull(klienProfiles.ptId), eq(klienProfiles.id, klienId))
      : isNotNull(klienProfiles.ptId);

  // Hanya klien aktif (bukan suspended/soft-deleted) yang perlu dibuatkan plan.
  const klienRows = await db.query.klienProfiles.findMany({
    where,
    with: {
      user: {
        columns: { isActive: true, deletedAt: true },
      },
    },
  });
  const klienList = klienRows.filter(
    (klien) => klien.user?.isActive && !klien.user?.deletedAt,
  );

  // Klien yang sudah punya plan minggu ini dilewati. Dicatat sekali agar urutan
  // proses bisa memprioritaskan klien yang belum kebagian.
  const existingPlansThisWeek = await db
    .select({ klienId: weeklyPlans.klienId })
    .from(weeklyPlans)
    .where(eq(weeklyPlans.mingguMulai, startOfWeek));
  const plannedKlienIds = new Set(existingPlansThisWeek.map((row) => row.klienId));

  // Waktu generate terakhir per klien, untuk rotasi yang adil antar-minggu.
  const lastPlanRows = await db
    .select({
      klienId: weeklyPlans.klienId,
      lastGeneratedAt: sql<Date | string>`MAX(${weeklyPlans.generatedAt})`,
    })
    .from(weeklyPlans)
    .groupBy(weeklyPlans.klienId);
  const lastGeneratedByKlien = new Map(
    lastPlanRows.map((row) => [row.klienId, row.lastGeneratedAt]),
  );

  const lastGeneratedMs = (klienProfileId: number) => {
    const value = lastGeneratedByKlien.get(klienProfileId);
    if (!value) return 0;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };

  // Prioritas: belum punya plan minggu ini -> yang paling lama tidak digenerate -> id.
  // Tanpa urutan eksplisit, klien ber-ID besar (mis. data demo) selalu terakhir dan
  // tidak pernah tercapai saat `limit` kecil.
  const orderedKlien = [...klienList].sort((a, b) => {
    const aPlanned = plannedKlienIds.has(a.id) ? 1 : 0;
    const bPlanned = plannedKlienIds.has(b.id) ? 1 : 0;
    if (aPlanned !== bPlanned) return aPlanned - bPlanned;

    const byLastGenerated = lastGeneratedMs(a.id) - lastGeneratedMs(b.id);
    return byLastGenerated !== 0 ? byLastGenerated : a.id - b.id;
  });

  let count = 0;
  let attempts = 0;
  let skipped = 0;

  for (const klien of orderedKlien) {
    if (limit !== undefined && attempts >= limit) break;

    const [cycle] = await db
      .select()
      .from(progressCycles)
      .where(and(eq(progressCycles.klienId, klien.id), eq(progressCycles.status, "aktif")))
      .limit(1);
    if (!cycle || !klien.ptId) {
      skipped += 1;
      continue;
    }

    const [pt] = await db.select().from(ptProfiles).where(eq(ptProfiles.id, klien.ptId)).limit(1);
    if (!pt?.tempatGym) {
      // PT belum lengkapi profil, skip dulu.
      skipped += 1;
      continue;
    }

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
      // Hindari bentrok dengan klien lain PT ini (termasuk plan yang baru dibuat di run ini).
      const occupiedSlots = await getOccupiedWorkoutSlots(pt.id, startOfWeek, klien.id);

      // generateWeeklyPlan sudah punya timeout + fallback deterministik di dalamnya.
      const plan = await generateWeeklyPlan({
        tinggiBadanCm: klien.tinggiBadanCm,
        alergiMakanan: klien.alergiMakanan,
        bbAwalKg: cycle.bbAwalKg,
        bbSekarangKg: latestWeight?.beratBadanKg ?? cycle.bbAwalKg,
        bbTujuanKg: cycle.bbTujuanKg,
        tujuan: cycle.tujuan,
        tempatGym: pt.tempatGym,
        occupiedSlots,
        seed: klien.id,
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

  const unplannedCount = klienList.filter((klien) => !plannedKlienIds.has(klien.id)).length;
  const remaining = Math.max(0, unplannedCount - count - skipped);

  console.log(
    `generateWeeklyPlanForAllActiveKlien: ${count} plan digenerate, ${remaining} tersisa ` +
      `(attempts ${attempts}, total ${klienList.length})`,
  );
  return { count, remaining, total: klienList.length };
}
