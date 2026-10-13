/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-riwayat-pt.ts
 *
 * Script manual (seed sendiri) untuk GET /pt/riwayat. Butuh DB lokal aktif.
 * Semua user di-seed dengan userId != profileId agar bug ownership tidak tersembunyi.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles, klienProfiles, progressCycles, weightLogs } from "../../src/db/schema";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9987;

let counter = 0;
function uniq(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}

function shiftUtcDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
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

function sign(userId: number, role: "pt" | "klien") {
  const token = jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" });
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function createPt(label: string, withProfile: boolean) {
  const hash = await argon2.hash("password123");
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: hash, role: "pt",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 500_000_000;
  if (withProfile) {
    await db.insert(ptProfiles).values({ id: profileId, userId, nama: `PT ${label}`, spesialisasi: "turun_bb", tempatGym: "Gym RW" });
  }
  return { userId, profileId, auth: sign(userId, "pt") };
}

async function createKlien(
  label: string,
  ptId: number,
  demografi?: { usia: number; jenisKelamin: "pria" | "wanita" },
) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({
    id: profileId, userId, nama: `Klien ${label}`, ptId,
    usia: demografi?.usia, jenisKelamin: demografi?.jenisKelamin,
  });
  return { userId, profileId };
}

async function seedCycle(klienId: number, bbAwalKg: number, tanggalMulai: string) {
  await db.insert(progressCycles).values({
    klienId, bbAwalKg, bbTujuanKg: 60, tujuan: "turun_bb", durasiHari: 30,
    targetKaloriPerHari: 1800, status: "aktif", tanggalMulai,
  });
}

async function seedWeight(klienId: number, beratBadanKg: number, tanggal: string) {
  await db.insert(weightLogs).values({ klienId, beratBadanKg, tanggal });
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;
  const today = new Date().toISOString().slice(0, 10);

  try {
    console.log("\n=== SETUP ===");
    const pt1 = await createPt("rw1", true);
    const pt2 = await createPt("rw2", true);
    const ptEmpty = await createPt("rwempty", true);
    const ptNoProfile = await createPt("rwno", false);

    const A = await createKlien("A", pt1.profileId, { usia: 30, jenisKelamin: "pria" });
    const B = await createKlien("B", pt1.profileId);
    const C = await createKlien("C", pt1.profileId);
    const D = await createKlien("D", pt2.profileId);
    const E = await createKlien("E", pt1.profileId);

    // A: 2 cycle (tertua 90, baru 80) + 3 log (terakhir 74)
    await seedCycle(A.profileId, 90, shiftUtcDate(today, -30));
    await seedCycle(A.profileId, 80, shiftUtcDate(today, -10));
    await seedWeight(A.profileId, 88, shiftUtcDate(today, -5));
    await seedWeight(A.profileId, 76, shiftUtcDate(today, -1));
    await seedWeight(A.profileId, 74, today);

    // B: tanpa cycle & log -> null
    // C: cycle saja, tanpa log
    await seedCycle(C.profileId, 85, shiftUtcDate(today, -20));

    // D: milik PT2
    await seedCycle(D.profileId, 95, shiftUtcDate(today, -25));
    await seedWeight(D.profileId, 90, today);

    // E: tiebreak -> cycle sama tanggal (id ASC -> 100), weight sama tanggal (id DESC -> 69)
    await seedCycle(E.profileId, 100, shiftUtcDate(today, -20));
    await seedCycle(E.profileId, 99, shiftUtcDate(today, -20));
    await seedWeight(E.profileId, 70, shiftUtcDate(today, -3));
    await seedWeight(E.profileId, 69, shiftUtcDate(today, -3));

    console.log("\n=== TES GET /pt/riwayat (PT1) ===");
    {
      const res = await fetch(`${baseUrl}/pt/riwayat`, { headers: pt1.auth });
      const body = await res.json();
      console.log(`PT1 raw: [${res.status}] ${JSON.stringify(body)}`);

      check("status 200 + meta.total 4", res.status === 200 && body.meta.total === 4, body);
      check("urut nama ASC (A,B,C,E)", body.data.map((k: any) => k.nama).join(",") === "Klien A,Klien B,Klien C,Klien E", body.data);

      const a = body.data.find((k: any) => k.id === A.profileId);
      check("A: bbAwal 90 (siklus tertua) & bbSekarang 74 (log terakhir)", a.bbAwalKg === 90 && a.bbSekarangKg === 74, a);
      check("A: usia & jenisKelamin terisi", a.usia === 30 && a.jenisKelamin === "pria", a);
      check("A: tujuan+durasiHari dari siklus aktif", a.tujuan === "turun_bb" && a.durasiHari === 30, a);

      const b = body.data.find((k: any) => k.id === B.profileId);
      check("B: tanpa cycle & log -> null", b.bbAwalKg === null && b.bbSekarangKg === null && b.usia === null && b.jenisKelamin === null, b);
      check("B: tanpa siklus aktif -> tujuan/durasiHari null", b.tujuan === null && b.durasiHari === null, b);

      const c = body.data.find((k: any) => k.id === C.profileId);
      check("C: cycle saja -> bbAwal 85, bbSekarang null", c.bbAwalKg === 85 && c.bbSekarangKg === null, c);
      check("C: tujuan+durasiHari dari siklus aktif", c.tujuan === "turun_bb" && c.durasiHari === 30, c);

      const e = body.data.find((k: any) => k.id === E.profileId);
      check("E: tiebreak cycle id ASC (100) & weight id DESC (69)", e.bbAwalKg === 100 && e.bbSekarangKg === 69, e);
      check("E: tujuan+durasiHari dari siklus aktif", e.tujuan === "turun_bb" && e.durasiHari === 30, e);

      check("D (PT2) tidak muncul", !body.data.some((k: any) => k.id === D.profileId), body.data);
    }

    console.log("\n=== TES isolasi PT2 ===");
    {
      const res = await fetch(`${baseUrl}/pt/riwayat`, { headers: pt2.auth });
      const body = await res.json();
      console.log(`PT2 raw: [${res.status}] ${JSON.stringify(body)}`);
      check("PT2 hanya kliennya (D)", res.status === 200 && body.meta.total === 1 && body.data[0].id === D.profileId, body);
    }

    console.log("\n=== TES PT tanpa klien ===");
    {
      const res = await fetch(`${baseUrl}/pt/riwayat`, { headers: ptEmpty.auth });
      const body = await res.json();
      console.log(`PT_EMPTY raw: [${res.status}] ${JSON.stringify(body)}`);
      check("tanpa klien -> data [] meta 0", res.status === 200 && body.data.length === 0 && body.meta.total === 0, body);
    }

    console.log("\n=== TES PT tanpa profil ===");
    {
      const res = await fetch(`${baseUrl}/pt/riwayat`, { headers: ptNoProfile.auth });
      console.log(`PT_NO_PROFILE raw: [${res.status}] ${await res.text()}`);
      check("tanpa profil PT -> 404", res.status === 404, res.status);
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
