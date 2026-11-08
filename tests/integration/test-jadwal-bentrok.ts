/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-jadwal-bentrok.ts
 *
 * Tes fungsi murni deteksi bentrok jadwal (tanpa DB/AI).
 */
import {
  parseTimeRange,
  rangesOverlap,
  findConflicts,
  pickFreeSlots,
} from "../../src/utils/schedule";

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

console.log("\n=== parseTimeRange ===");
{
  const r = parseTimeRange("17:00 - 18:00");
  check("range 17:00-18:00", r?.start === 1020 && r?.end === 1080, r);

  const dots = parseTimeRange("17.00-18.00");
  check("range dengan titik", dots?.start === 1020 && dots?.end === 1080, dots);

  const single = parseTimeRange("07:00");
  check("jam tunggal -> +90 menit", single?.start === 420 && single?.end === 510, single);

  const enDash = parseTimeRange("17:30–18:30");
  check("range en-dash", enDash?.start === 1050 && enDash?.end === 1110, enDash);

  check("tidak valid -> null", parseTimeRange("ngawur") === null);
}

console.log("\n=== rangesOverlap ===");
{
  const a = { start: 1020, end: 1080 }; // 17:00-18:00
  check("overlap parsial 17:30", rangesOverlap(a, { start: 1050, end: 1110 }));
  check("adjacent (18:00 mulai) tidak overlap", !rangesOverlap(a, { start: 1080, end: 1140 }));
  check("beda jauh tidak overlap", !rangesOverlap(a, { start: 600, end: 660 }));
}

console.log("\n=== findConflicts: antar klien ===");
{
  const proposed = [{ hari: "Senin", jam: "17:00 - 18:00", jenis: "A" }];
  const others = [
    {
      klienId: 2,
      namaKlien: "Budi",
      workoutPlan: [{ hari: "senin", jam: "17:30 - 19:00", jenis: "B" }],
    },
  ];
  const conflicts = findConflicts(proposed, others);
  check("bentrok parsial terdeteksi", conflicts.length === 1 && conflicts[0].tipe === "antar_klien", conflicts);
  check("index & nama benar", conflicts[0]?.proposedIndex === 0 && conflicts[0]?.denganNamaKlien === "Budi", conflicts[0]);

  const adjacent = findConflicts(proposed, [
    { klienId: 3, namaKlien: "Citra", workoutPlan: [{ hari: "Senin", jam: "18:00 - 19:30", jenis: "C" }] },
  ]);
  check("jadwal bersambung tidak bentrok", adjacent.length === 0, adjacent);

  const differentDay = findConflicts(proposed, [
    { klienId: 4, namaKlien: "Dewi", workoutPlan: [{ hari: "Selasa", jam: "17:00 - 18:00", jenis: "D" }] },
  ]);
  check("beda hari tidak bentrok", differentDay.length === 0, differentDay);
}

console.log("\n=== findConflicts: dalam satu plan ===");
{
  const proposed = [
    { hari: "Senin", jam: "17:00 - 18:30", jenis: "A" },
    { hari: "Senin", jam: "18:00 - 19:30", jenis: "B" },
  ];
  const conflicts = findConflicts(proposed, []);
  check("dua sesi bertumpuk dalam plan terdeteksi", conflicts.some((c) => c.tipe === "dalam_plan"), conflicts);
}

console.log("\n=== pickFreeSlots ===");
{
  const empty = pickFreeSlots([], 3, 0);
  check("3 slot dihasilkan", empty.length === 3, empty);
  check(
    "hari berbeda",
    new Set(empty.map((s) => s.hari)).size === empty.length,
    empty,
  );
  const ranges = empty.map((s) => ({
    day: s.hari,
    range: parseTimeRange(s.jam)!,
  }));
  check(
    "tidak saling bertumpuk (hari+jam)",
    ranges.every((a, i) =>
      ranges.every(
        (b, j) => i === j || a.day !== b.day || !rangesOverlap(a.range, b.range),
      ),
    ),
    empty,
  );
  check(
    "berakhir <= 21:00",
    ranges.every((r) => r.range.end <= 21 * 60),
    empty,
  );

  const occupied = [{ hari: "Senin", jam: "06:00 - 07:30" }];
  const withOccupied = pickFreeSlots(occupied, 1, 0);
  check(
    "menghindari slot terpakai",
    withOccupied.length === 1 &&
      !(withOccupied[0].hari === "Senin" && withOccupied[0].jam === "06:00 - 07:30"),
    withOccupied,
  );

  const seed0 = pickFreeSlots([], 1, 0)[0];
  const seed1 = pickFreeSlots([], 1, 1)[0];
  check("seed memvariasikan hari/jam", seed0.hari !== seed1.hari || seed0.jam !== seed1.jam, { seed0, seed1 });
}

console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed} ===`);
if (failed > 0) process.exitCode = 1;
