/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-klien-response-hardening.ts
 *
 * Verifikasi perbaikan sisi klien (catatan mobile §6): 6.1 passwordHash bocor,
 * 6.3 bbSekarangKg, 6.4 activeCycle null eksplisit, 6.7 createdAt, 6.2 kaloriMasukHariIni.
 * Butuh DB lokal aktif. userId != klienProfileId agar konsisten pola project.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, klienProfiles, progressCycles, weightLogs, mealLogs, masterMakanan } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";

const PORT = 9986;

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

async function createKlien(label: string, demografi?: { usia: number; jenisKelamin: "pria" | "wanita"; tinggiBadanCm: number }) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({
    id: profileId, userId, nama: `Klien ${label}`,
    usia: demografi?.usia, jenisKelamin: demografi?.jenisKelamin, tinggiBadanCm: demografi?.tinggiBadanCm,
  });
  const token = jwt.sign({ sub: userId, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
  return { userId, profileId, auth: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

async function seedCycle(klienId: number, tanggalMulai: string) {
  await db.insert(progressCycles).values({
    klienId, bbAwalKg: 80, bbTujuanKg: 70, tujuan: "turun_bb", durasiHari: 30,
    targetKaloriPerHari: 1800, status: "aktif", tanggalMulai,
  });
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;
  const today = new Date().toISOString().slice(0, 10);

  try {
    console.log("\n=== SETUP ===");
    const K1 = await createKlien("hard1"); // tanpa cycle & log
    const K2 = await createKlien("hard2", { usia: 30, jenisKelamin: "pria", tinggiBadanCm: 170 }); // lengkap
    const K3 = await createKlien("hard3"); // cycle, tanpa meal/weight

    await seedCycle(K2.profileId, shiftUtcDate(today, -5));
    await db.insert(weightLogs).values({ klienId: K2.profileId, beratBadanKg: 80, tanggal: shiftUtcDate(today, -2) });
    await db.insert(weightLogs).values({ klienId: K2.profileId, beratBadanKg: 78, tanggal: today });

    await seedCycle(K3.profileId, shiftUtcDate(today, -3));

    let makanan = await db.query.masterMakanan.findFirst();
    if (!makanan) {
      const ins = await db.insert(masterMakanan).values({ nama: uniq("Makanan"), kaloriPer100g: 100, kategori: "karbohidrat" });
      makanan = await db.query.masterMakanan.findFirst({ where: eq(masterMakanan.id, ins[0].insertId) });
    }
    await db.insert(mealLogs).values({ klienId: K2.profileId, makananId: makanan!.id, porsiGram: 300, kaloriMasuk: 300, tanggal: today });
    await db.insert(mealLogs).values({ klienId: K2.profileId, makananId: makanan!.id, porsiGram: 200, kaloriMasuk: 200, tanggal: today });

    console.log("\n=== TES 6.1/6.4/6.7 GET /klien/profile (K1: tanpa cycle) ===");
    {
      const res = await fetch(`${baseUrl}/klien/profile`, { headers: K1.auth });
      const raw = await res.text();
      const body = JSON.parse(raw);
      console.log(`K1 raw: [${res.status}] ${raw}`);

      check("6.1 tidak ada passwordHash di raw response", !raw.includes("passwordHash"), raw.includes("passwordHash"));
      check("6.1 user.passwordHash undefined", body.data.user.passwordHash === undefined, body.data.user);
      check("6.1 field user yang dipakai mobile tetap ada", body.data.user.email && body.data.user.username && body.data.user.tema && body.data.user.role, body.data.user);
      check("field top-level mobile tetap ada", body.data.id === K1.profileId && body.data.userId === K1.userId && body.data.nama === "Klien hard1", body.data);
      check("6.4 activeCycle null eksplisit (key ada)", "activeCycle" in body.data && body.data.activeCycle === null, body.data);
      check("6.3 bbSekarangKg null tanpa log", body.data.bbSekarangKg === null, body.data);
      check("6.7 createdAt ada (ISO)", typeof body.data.createdAt === "string" && !Number.isNaN(Date.parse(body.data.createdAt)), body.data.createdAt);
      check("profileComplete false tanpa cycle", body.data.profileComplete === false, body.data);
    }

    console.log("\n=== TES 6.3/6.4 GET /klien/profile (K2: lengkap) ===");
    {
      const res = await fetch(`${baseUrl}/klien/profile`, { headers: K2.auth });
      const body = await res.json();
      console.log(`K2 raw: [${res.status}] ${JSON.stringify(body)}`);
      check("6.4 activeCycle objek saat ada cycle", body.data.activeCycle && body.data.activeCycle.status === "aktif", body.data.activeCycle);
      check("6.3 bbSekarangKg = log terakhir (78)", body.data.bbSekarangKg === 78, body.data);
      check("profileComplete true", body.data.profileComplete === true, body.data);
      check("6.1 passwordHash tetap tidak ada", !JSON.stringify(body).includes("passwordHash"), body.data.user);
    }

    console.log("\n=== TES 6.2 dashboard-summary ===");
    {
      const k1 = await fetch(`${baseUrl}/klien/dashboard-summary`, { headers: K1.auth });
      const b1 = await k1.json();
      console.log(`K1 dashboard raw: [${k1.status}] ${JSON.stringify(b1)}`);
      check("tanpa cycle aktif -> kaloriMasukHariIni null", b1.data.kaloriMasukHariIni === null, b1.data);

      const k3 = await fetch(`${baseUrl}/klien/dashboard-summary`, { headers: K3.auth });
      const b3 = await k3.json();
      console.log(`K3 dashboard raw: [${k3.status}] ${JSON.stringify(b3)}`);
      check("cycle aktif tanpa meal -> kaloriMasukHariIni 0", b3.data.kaloriMasukHariIni === 0, b3.data);

      const k2 = await fetch(`${baseUrl}/klien/dashboard-summary`, { headers: K2.auth });
      const b2 = await k2.json();
      console.log(`K2 dashboard raw: [${k2.status}] ${JSON.stringify(b2)}`);
      check("cycle aktif + meal hari ini -> SUM (500)", b2.data.kaloriMasukHariIni === 500, b2.data);
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
