/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-weekly-plan-fallback.ts
 *
 * Verifikasi plan cadangan deterministik (dipakai saat AI gagal/timeout).
 * Tidak butuh DB maupun Gemini.
 */
import { buildFallbackWeeklyPlan } from "../../src/modules/ai/weekly-plan";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
    if (detail !== undefined) console.error("  detail:", JSON.stringify(detail));
  }
}

for (const tujuan of ["turun_bb", "naik_bb"] as const) {
  const plan = buildFallbackWeeklyPlan({ tujuan, tempatGym: "Gym Test" });
  check(`${tujuan}: workout minimal 3 item`, plan.workoutPlan.length >= 3, plan.workoutPlan);
  check(
    `${tujuan}: semua lokasi = tempatGym`,
    plan.workoutPlan.every((w) => w.lokasi === "Gym Test"),
    plan.workoutPlan,
  );
  check(`${tujuan}: meal minimal 4 item`, plan.mealPlan.length >= 4, plan.mealPlan);
  check(
    `${tujuan}: semua kalori > 0`,
    plan.mealPlan.every((m) => typeof m.estimasiKalori === "number" && m.estimasiKalori > 0),
    plan.mealPlan,
  );
  check(
    `${tujuan}: field workout lengkap`,
    plan.workoutPlan.every((w) => Boolean(w.hari && w.jam && w.jenis)),
    plan.workoutPlan,
  );
}

console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed} ===`);
if (failed > 0) process.exitCode = 1;
