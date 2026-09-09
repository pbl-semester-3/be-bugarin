import { and, eq, isNotNull, desc } from "drizzle-orm";
import { db } from "../config/db";
import { klienProfiles, progressCycles, ptProfiles, weightLogs, weeklyPlans } from "../db/schema";
import { generateWeeklyPlan } from "../modules/ai/weekly-plan";

// Dipanggil oleh: (1) node-cron lokal saat development, (2) endpoint /internal/jobs/*
// yang dipicu cron-job.org di production (lihat SETUP.md bab 4 — Render free tier bisa
// tidur, jadi trigger eksternal lebih diandalkan daripada node-cron murni).
export async function generateWeeklyPlanForAllActiveKlien() {
  const klienList = await db
    .select()
    .from(klienProfiles)
    .where(isNotNull(klienProfiles.ptId));

  let count = 0;
  for (const klien of klienList) {
    const [cycle] = await db
      .select()
      .from(progressCycles)
      .where(and(eq(progressCycles.klienId, klien.id), eq(progressCycles.status, "aktif")))
      .limit(1);
    if (!cycle || !klien.ptId) continue;

    const [pt] = await db.select().from(ptProfiles).where(eq(ptProfiles.id, klien.ptId)).limit(1);
    if (!pt?.tempatGym) continue; // PT belum lengkapi profil, skip dulu

    const [latestWeight] = await db
      .select()
      .from(weightLogs)
      .where(eq(weightLogs.klienId, klien.id))
      .orderBy(desc(weightLogs.tanggal))
      .limit(1);

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
      mingguMulai: new Date().toISOString().slice(0, 10),
      workoutPlan: plan.workoutPlan,
      mealPlan: plan.mealPlan,
      status: "pending_review",
    });
    count++;
  }

  console.log(`generateWeeklyPlanForAllActiveKlien: ${count} plan digenerate`);
  return count;
}
