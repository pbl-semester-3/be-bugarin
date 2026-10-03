/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-awal-minggu.ts
 *
 * Menguji helper kanonik awal minggu (Senin, UTC). Tidak butuh server/DB.
 */
import { getStartOfWeekUtc, getMondayOfDateStringUtc } from "../../src/utils/week";

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

function utcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function run() {
  const cases: Array<[string, string]> = [
    ["2026-10-02", "2026-09-28"], // Jumat -> Senin sebelumnya
    ["2026-10-03", "2026-09-28"], // Sabtu -> Senin sebelumnya
    ["2026-10-04", "2026-09-28"], // Minggu -> Senin sebelumnya (kasus krusial)
    ["2026-09-28", "2026-09-28"], // Senin -> dirinya sendiri
    ["2026-11-01", "2026-10-26"], // Minggu lintas bulan
    ["2027-01-01", "2026-12-28"], // Jumat lintas tahun
  ];

  for (const [input, expected] of cases) {
    const actual = getStartOfWeekUtc(utcDate(input));
    check(`getStartOfWeekUtc(${input}) = ${expected}`, actual === expected, { input, expected, actual });
  }

  for (const [input] of cases) {
    const result = getStartOfWeekUtc(utcDate(input));
    check(`hasil untuk ${input} jatuh pada hari Senin`, utcDate(result).getUTCDay() === 1, result);
  }

  check(
    "getMondayOfDateStringUtc konsisten dengan getStartOfWeekUtc",
    getMondayOfDateStringUtc("2026-10-04") === getStartOfWeekUtc(utcDate("2026-10-04")),
    getMondayOfDateStringUtc("2026-10-04"),
  );

  console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed} ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
