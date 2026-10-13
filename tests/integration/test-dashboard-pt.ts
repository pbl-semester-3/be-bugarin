/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-dashboard-pt.ts
 *
 * Script manual (seed sendiri) untuk GET /pt/dashboard-summary. Butuh DB lokal aktif.
 * Semua user di-seed dengan userId != profileId agar bug ownership tidak tersembunyi.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles, klienProfiles, weeklyPlans } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";
import { getStartOfWeekUtc } from "../../src/utils/week";
import { getDayOrder, normalizeHari } from "../../src/utils/day";

const PORT = 9989;

let counter = 0;
function uniq(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}

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

async function createPt(label: string, tempatGym: string | null) {
  const hash = await argon2.hash("password123");
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: hash, role: "pt",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 500_000_000;
  await db.insert(ptProfiles).values({ id: profileId, userId, nama: `PT ${label}`, spesialisasi: "turun_bb", tempatGym });
  const token = jwt.sign({ sub: userId, role: "pt" }, env.JWT_SECRET, { expiresIn: "1d" });
  return { userId, profileId, auth: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

async function createKlien(label: string, ptId: number) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({ id: profileId, userId, nama: `Klien ${label}`, ptId });
  return { userId, profileId };
}

type WorkoutSeed = { hari: string; jam: string; jenis: string };

async function seedPlan(
  klienId: number,
  status: "pending_review" | "disetujui" | "override",
  workoutPlan: WorkoutSeed[],
  generatedAt?: Date,
) {
  const ins = await db.insert(weeklyPlans).values({
    klienId,
    mingguMulai: getStartOfWeekUtc(),
    workoutPlan: workoutPlan.map((w) => ({ ...w, lokasi: "seed" })),
    mealPlan: [{ waktu: "Pagi", menu: "Oatmeal", estimasiKalori: 300 }],
    status,
    ...(generatedAt ? { generatedAt } : {}),
  });
  return ins[0].insertId;
}

function isSorted(items: { hari: string; jam: string }[]): boolean {
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const pd = getDayOrder(prev.hari);
    const cd = getDayOrder(cur.hari);
    if (cd < pd) return false;
    if (cd === pd && cur.jam < prev.jam) return false;
  }
  return true;
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const pt1 = await createPt("dashpt1", "Gym PT1");
    const pt2 = await createPt("dashpt2", "Gym PT2");
    const ptNull = await createPt("dashptnull", null);
    const ptEmpty = await createPt("dashptempty", "Gym Empty");

    const A = await createKlien("A", pt1.profileId);
    const B = await createKlien("B", pt1.profileId);
    const C = await createKlien("C", pt1.profileId);
    const D = await createKlien("D", pt1.profileId);
    const E = await createKlien("E", pt2.profileId);
    const F = await createKlien("F", ptNull.profileId);
    const G = await createKlien("G", pt1.profileId);
    const H = await createKlien("H", pt1.profileId);

    await seedPlan(A.profileId, "disetujui", [
      { hari: "Rabu", jam: "16:00", jenis: "Leg" },
      { hari: "Senin", jam: "9:00", jenis: "Upper" },
    ]);
    await seedPlan(B.profileId, "override", [{ hari: "Senin", jam: "16.00", jenis: "Cardio" }]);
    await seedPlan(C.profileId, "pending_review", [{ hari: "Senin", jam: "10:00", jenis: "Pending" }]);
    await seedPlan(E.profileId, "disetujui", [{ hari: "Selasa", jam: "08:00", jenis: "Milik PT2" }]);
    await seedPlan(F.profileId, "disetujui", [{ hari: "Kamis", jam: "07:30", jenis: "NoGym" }]);
    // G: dua plan minggu yang sama -> harus pakai yang generatedAt terbaru
    await seedPlan(G.profileId, "disetujui", [{ hari: "Senin", jam: "20:00", jenis: "Old" }], new Date(Date.now() - 3_600_000));
    await seedPlan(G.profileId, "disetujui", [{ hari: "Senin", jam: "07:00", jenis: "New" }], new Date());
    // H: hari/jam tidak konsisten -> harus dinormalisasi
    await seedPlan(H.profileId, "disetujui", [{ hari: "senin", jam: "9.0", jenis: "Normalisasi" }]);

    console.log("\n=== TES GET /pt/dashboard-summary (PT1) ===");
    {
      const res = await fetch(`${baseUrl}/pt/dashboard-summary`, { headers: pt1.auth });
      const body = await res.json();
      console.log(`PT1 raw: [${res.status}] ${JSON.stringify(body)}`);

      check("jumlahKlienAktif = 6 (A,B,C,D,G,H; E/F bukan milik PT1)", body.data.jumlahKlienAktif === 6, body.data);
      const jadwal = body.data.jadwalLatihan;
      check("jadwalLatihan 5 item (pending C dibuang, D tanpa plan, duplikat G terbaru)", jadwal.length === 5, jadwal);

      const ids = jadwal.map((j: any) => j.klienId);
      check("tidak ada jadwal C (pending_review)", !ids.includes(C.profileId), ids);
      check("tidak ada jadwal E (milik PT2)", !ids.includes(E.profileId), ids);

      check("semua hari kanonik", jadwal.every((j: any) => normalizeHari(j.hari) === j.hari), jadwal);
      check("semua lokasi = Gym PT1", jadwal.every((j: any) => j.lokasi === "Gym PT1"), jadwal);
      check("urutan hari+jam benar", isSorted(jadwal), jadwal);

      const multiset = jadwal.map((j: any) => `${j.hari} ${j.jam}`).sort();
      const expected = ["Senin 07:00", "Senin 09:00", "Senin 09:00", "Senin 16:00", "Rabu 16:00"].sort();
      check("kombinasi hari+jam sesuai (normalisasi jam)", JSON.stringify(multiset) === JSON.stringify(expected), { multiset, expected });

      const gItems = jadwal.filter((j: any) => j.klienId === G.profileId);
      check("duplikat plan -> pakai generatedAt terbaru (jenis New)", gItems.length === 1 && gItems[0].jenis === "New", gItems);

      const hItems = jadwal.filter((j: any) => j.klienId === H.profileId);
      check("normalisasi hari 'senin' & jam '9.0' -> 'Senin' '09:00'", hItems.length === 1 && hItems[0].hari === "Senin" && hItems[0].jam === "09:00", hItems);

      check("item pertama jam 07:00 (paling pagi)", jadwal[0].jam === "07:00", jadwal[0]);
      check("item terakhir hari Rabu", jadwal[jadwal.length - 1].hari === "Rabu", jadwal[jadwal.length - 1]);
    }

    console.log("\n=== TES PT tanpa tempat_gym (fallback lokasi) ===");
    {
      const res = await fetch(`${baseUrl}/pt/dashboard-summary`, { headers: ptNull.auth });
      const body = await res.json();
      console.log(`PT_NULL raw: [${res.status}] ${JSON.stringify(body)}`);
      check("lokasi fallback '-' saat tempat_gym null", res.status === 200 && body.data.jadwalLatihan.length === 1 && body.data.jadwalLatihan[0].lokasi === "-", body);
    }

    console.log("\n=== TES PT tanpa klien ===");
    {
      const res = await fetch(`${baseUrl}/pt/dashboard-summary`, { headers: ptEmpty.auth });
      const body = await res.json();
      console.log(`PT_EMPTY raw: [${res.status}] ${JSON.stringify(body)}`);
      check("tanpa klien -> 0 + []", res.status === 200 && body.data.jumlahKlienAktif === 0 && body.data.jadwalLatihan.length === 0, body);
    }

    console.log("\n=== TES PT2 (isolasi) ===");
    {
      const res = await fetch(`${baseUrl}/pt/dashboard-summary`, { headers: pt2.auth });
      const body = await res.json();
      console.log(`PT2 raw: [${res.status}] ${JSON.stringify(body)}`);
      check("PT2 hanya lihat kliennya (E)", res.status === 200 && body.data.jumlahKlienAktif === 1 && body.data.jadwalLatihan[0].klienId === E.profileId, body);
    }

    console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed} ===`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error("Fatal Test error:", error);
    process.exitCode = 1;
  } finally {
    server.close();
    await db.$client.end();
  }
}

runTests();
