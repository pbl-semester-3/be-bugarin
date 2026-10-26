// db/clean-demo.ts
// Jalankan: npm run db:clean-demo            (dry-run: hanya menampilkan target)
//           npm run db:clean-demo -- --yes   (hapus data demo)
//           npm run db:clean-demo -- --test --yes  (ikut hapus user @test.com)
//
// Menghapus user demo (`demo.%@bugarin.com`) dan opsional sisa data uji
// (`%@test.com`) beserta seluruh relasinya, dengan urutan aman terhadap FK.
// Env-gated: tolak NODE_ENV=production kecuali ALLOW_SEED_DEMO=true.

import { db } from "../src/config/db";
import {
  users,
  klienProfiles,
  ptProfiles,
  adminProfiles,
  progressCycles,
  weightLogs,
  weeklyPlans,
  pairingRequests,
  feedbacks,
  adminActivityLogs,
  activityLogs,
  mealLogs,
  passwordResetTokens,
} from "../src/db/schema";
import { and, inArray, like, notInArray, or } from "drizzle-orm";

const args = process.argv.slice(2);
const includeTest = args.includes("--test");
const confirmed = args.includes("--yes");

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_SEED_DEMO !== "true"
  ) {
    console.error(
      "Tolak: NODE_ENV=production. Set ALLOW_SEED_DEMO=true bila memang disengaja."
    );
    process.exit(1);
  }

  const patterns = [like(users.email, "demo.%@bugarin.com")];
  if (includeTest) patterns.push(like(users.email, "%@test.com"));

  const targets = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(or(...patterns));

  if (targets.length === 0) {
    console.log("Tidak ada user yang cocok untuk dibersihkan.");
    process.exit(0);
  }

  const userIds = targets.map((t) => t.id);
  const klienRows = await db
    .select({ id: klienProfiles.id })
    .from(klienProfiles)
    .where(inArray(klienProfiles.userId, userIds));
  const ptRows = await db
    .select({ id: ptProfiles.id })
    .from(ptProfiles)
    .where(inArray(ptProfiles.userId, userIds));

  const klienIds = klienRows.map((r) => r.id);
  const ptIds = ptRows.map((r) => r.id);

  const byRole = targets.reduce<Record<string, number>>((acc, t) => {
    acc[t.role] = (acc[t.role] ?? 0) + 1;
    return acc;
  }, {});

  console.log("=== Clean demo ===");
  console.log(
    `Pattern: demo.%@bugarin.com${includeTest ? " + %@test.com" : ""}`
  );
  console.log(`Target user: ${userIds.length} (${JSON.stringify(byRole)})`);
  console.log(`Klien profiles: ${klienIds.length}, PT profiles: ${ptIds.length}`);

  if (!confirmed) {
    console.log("\nDRY-RUN: tidak ada yang dihapus.");
    console.log("Jalankan ulang dengan --yes untuk mengeksekusi.");
    process.exit(0);
  }

  const feedbackConds = [
    ...(klienIds.length ? [inArray(feedbacks.klienId, klienIds)] : []),
    ...(ptIds.length ? [inArray(feedbacks.ptId, ptIds)] : []),
  ];
  if (feedbackConds.length) {
    await db.delete(feedbacks).where(or(...feedbackConds));
  }

  const pairingConds = [
    ...(klienIds.length ? [inArray(pairingRequests.klienId, klienIds)] : []),
    ...(ptIds.length ? [inArray(pairingRequests.ptId, ptIds)] : []),
  ];
  if (pairingConds.length) {
    await db.delete(pairingRequests).where(or(...pairingConds));
  }

  if (klienIds.length) {
    await db.delete(activityLogs).where(inArray(activityLogs.klienId, klienIds));
    await db.delete(mealLogs).where(inArray(mealLogs.klienId, klienIds));
    await db.delete(weeklyPlans).where(inArray(weeklyPlans.klienId, klienIds));
    await db.delete(weightLogs).where(inArray(weightLogs.klienId, klienIds));
    await db
      .delete(progressCycles)
      .where(inArray(progressCycles.klienId, klienIds));
  }

  await db
    .delete(adminActivityLogs)
    .where(
      or(
        inArray(adminActivityLogs.adminId, userIds),
        inArray(adminActivityLogs.targetUserId, userIds)
      )
    );

  await db
    .delete(passwordResetTokens)
    .where(inArray(passwordResetTokens.userId, userIds));

  // Lepas klien nyata yang masih menunjuk ke PT demo sebelum PT dihapus.
  if (ptIds.length) {
    await db
      .update(klienProfiles)
      .set({ ptId: null })
      .where(
        and(inArray(klienProfiles.ptId, ptIds), notInArray(klienProfiles.userId, userIds))
      );
  }

  if (klienIds.length) {
    await db.delete(klienProfiles).where(inArray(klienProfiles.userId, userIds));
  }
  if (ptIds.length) {
    await db.delete(ptProfiles).where(inArray(ptProfiles.userId, userIds));
  }
  await db.delete(adminProfiles).where(inArray(adminProfiles.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));

  console.log(`\nSelesai: ${userIds.length} user demo/test dihapus.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Clean demo gagal:", err);
  process.exit(1);
});
