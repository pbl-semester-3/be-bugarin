import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/db";
import { klienProfiles, weeklyPlans } from "../db/schema";

export type OtherClientPlan = {
  klienId: number;
  namaKlien: string;
  workoutPlan: Array<{ hari: string; jam: string; jenis: string }>;
};

async function getPtClientNames(ptProfileId: number): Promise<Map<number, string>> {
  const clients = await db.query.klienProfiles.findMany({
    where: eq(klienProfiles.ptId, ptProfileId),
    columns: { id: true, nama: true },
  });
  return new Map(clients.map((c) => [c.id, c.nama]));
}

// Slot latihan yang sudah terpakai klien LAIN pada PT ini (minggu tertentu).
// Untuk GENERATE, panggil tanpa `statuses` (semua status) agar tidak membuat duplikat.
export async function getOccupiedWorkoutSlots(
  ptProfileId: number,
  weekStart: string,
  excludeKlienId: number,
  statuses?: Array<"pending_review" | "disetujui" | "override">,
): Promise<Array<{ hari: string; jam: string }>> {
  const names = await getPtClientNames(ptProfileId);
  const ids = [...names.keys()].filter((id) => id !== excludeKlienId);
  if (ids.length === 0) return [];

  const plans = await db.query.weeklyPlans.findMany({
    where: and(
      inArray(weeklyPlans.klienId, ids),
      eq(weeklyPlans.mingguMulai, weekStart),
      statuses ? inArray(weeklyPlans.status, statuses) : undefined,
    ),
  });

  return plans.flatMap((plan) =>
    plan.workoutPlan.map((item) => ({ hari: item.hari, jam: item.jam })),
  );
}

// Plan klien LAIN yang sudah final (disetujui/override) untuk deteksi bentrok.
export async function getOtherClientPlans(
  ptProfileId: number,
  weekStart: string,
  excludeKlienId: number,
): Promise<OtherClientPlan[]> {
  const names = await getPtClientNames(ptProfileId);
  const ids = [...names.keys()].filter((id) => id !== excludeKlienId);
  if (ids.length === 0) return [];

  const plans = await db.query.weeklyPlans.findMany({
    where: and(
      inArray(weeklyPlans.klienId, ids),
      eq(weeklyPlans.mingguMulai, weekStart),
      inArray(weeklyPlans.status, ["disetujui", "override"]),
    ),
  });

  return plans.map((plan) => ({
    klienId: plan.klienId,
    namaKlien: names.get(plan.klienId) ?? "-",
    workoutPlan: plan.workoutPlan.map((item) => ({
      hari: item.hari,
      jam: item.jam,
      jenis: item.jenis,
    })),
  }));
}
