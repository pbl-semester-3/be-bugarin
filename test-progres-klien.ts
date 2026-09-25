import { createApp } from "./src/app";
import { db } from "./src/config/db";
import { users, klienProfiles, weightLogs, masterOlahraga, masterMakanan, weeklyPlans, activityLogs, mealLogs, progressCycles } from "./src/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "./src/config/env";

const PORT = 9999;

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);

  try {
    // 1. SETUP AWAL
    let klienUser = await db.query.users.findFirst({ where: eq(users.role, "klien") });
    if (!klienUser) {
      const uniqueUsername = `klien_${Date.now()}`;
      const [userInsert] = await db.insert(users).values({
        email: `${uniqueUsername}@test.com`,
        username: uniqueUsername,
        passwordHash: "hash",
        role: "klien"
      });
      klienUser = await db.query.users.findFirst({ where: eq(users.id, userInsert.insertId) });
      const [profileInsert] = await db.insert(klienProfiles).values({
        usersub: klienUser!.id,
        nama: "Test Klien",
      });
    }
    
    let klienProfile = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, klienUser!.id) });
    
    let activeCycle = await db.query.progressCycles.findFirst({ where: and(eq(progressCycles.klienId, klienProfile!.id), eq(progressCycles.status, "aktif")) });
    if (!activeCycle) {
      const [insertCycle] = await db.insert(progressCycles).values({
        klienId: klienProfile!.id,
        bbAwalKg: 70,
        bbTujuanKg: 65,
        tujuan: "turun_bb",
        durasiHari: 30,
        targetKaloriPerHari: 2000,
        status: "aktif",
        tanggalMulai: new Date().toISOString().slice(0, 10),
      });
    }

    await db.insert(weightLogs).values({
      klienId: klienProfile!.id,
      beratBadanKg: 69.5,
      tanggal: new Date().toISOString().slice(0, 10),
    });
    const bbTerkini = 69.5; 

    const token = jwt.sign({ sub: klienUser!.id, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
    const authHeaders = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
    const baseUrl = `http://localhost:${PORT}`;

    // Pastikan ada olahraga jarak true & false
    let olahragaJarakTrue = await db.query.masterOlahraga.findFirst({ where: eq(masterOlahraga.butuhJarak, true) });
    if (!olahragaJarakTrue) {
      const [res] = await db.insert(masterOlahraga).values({ nama: "Lari", metValue: 7.0, kategori: "kardio", butuhJarak: true });
      olahragaJarakTrue = await db.query.masterOlahraga.findFirst({ where: eq(masterOlahraga.id, res.insertId) });
    }
    
    let olahragaJarakFalse = await db.query.masterOlahraga.findFirst({ where: eq(masterOlahraga.butuhJarak, false) });
    if (!olahragaJarakFalse) {
      const [res] = await db.insert(masterOlahraga).values({ nama: "Yoga", metValue: 3.0, kategori: "fleksibilitas", butuhJarak: false });
      olahragaJarakFalse = await db.query.masterOlahraga.findFirst({ where: eq(masterOlahraga.id, res.insertId) });
    }

    console.log("=== TEST 1: POST /klien/activity-logs ===");
    const res1a = await fetch(`${baseUrl}/klien/activity-logs`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ olahragaId: olahragaJarakTrue!.id, durasiMenit: 30, jarakMeter: 5000 })
    });
    console.log(`1a. [${res1a.status}] ${await res1a.text()}`);

    const res1b = await fetch(`${baseUrl}/klien/activity-logs`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ olahragaId: olahragaJarakFalse!.id, durasiMenit: 60 })
    });
    console.log(`1b. [${res1b.status}] ${await res1b.text()}`);

    const res1c = await fetch(`${baseUrl}/klien/activity-logs`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ olahragaId: olahragaJarakFalse!.id, durasiMenit: 45, jarakMeter: 999 })
    });
    const text1c = await res1c.text();
    console.log(`1c. [${res1c.status}] Response: ${text1c}`);
    
    if (res1c.status === 201) {
      const data1c = JSON.parse(text1c);
      const actLog1c = await db.query.activityLogs.findFirst({ where: eq(activityLogs.id, data1c.data.id) });
      console.log(`    DB Verifikasi Jarak (SELECT jarak_meter FROM activity_logs WHERE id = ${data1c.data.id}): ${actLog1c?.jarakMeter === null ? 'PASS (null)' : `FAIL (${actLog1c?.jarakMeter})`}`);

      const expectedKalori = Math.round(olahragaJarakFalse!.metValue * bbTerkini * (45/60));
      console.log(`    DB Verifikasi Kalori: Expected=${expectedKalori}, Actual=${actLog1c?.kaloriTerbakar} (PASS: ${expectedKalori === actLog1c?.kaloriTerbakar})`);
    }

    console.log("\n=== TEST 2: POST /klien/meal-logs ===");
    let makananMaster = await db.query.masterMakanan.findFirst();
    if (!makananMaster) {
      const [res] = await db.insert(masterMakanan).values({ nama: "Nasi Putih", kaloriPer100g: 130, kategori: "karbohidrat" });
      makananMaster = await db.query.masterMakanan.findFirst({ where: eq(masterMakanan.id, res.insertId) });
    }
    const res2a = await fetch(`${baseUrl}/klien/meal-logs`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ makananId: makananMaster!.id, porsiGram: 200 })
    });
    console.log(`2a. [${res2a.status}] ${await res2a.text()}`);

    const uniqueNama = `Makanan Ajaib ${Date.now()}`;
    const res2b = await fetch(`${baseUrl}/klien/meal-logs`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ namaMakanan: uniqueNama, porsiGram: 100 })
    });
    console.log(`2b. [${res2b.status}] Response: ${await res2b.text()}`);
    const makBaru = await db.query.masterMakanan.findFirst({ where: sql`LOWER(nama) = LOWER(${uniqueNama})` });
    console.log(`    DB Verifikasi Makanan Baru: sumber=${makBaru?.sumber}`);

    const uniqueRace = `Race Food ${Date.now()}`;
    console.log(`    Mengirim 2 request paralel untuk: ${uniqueRace}`);
    const req1 = fetch(`${baseUrl}/klien/meal-logs`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ namaMakanan: uniqueRace, porsiGram: 100 })
    });
    const req2 = fetch(`${baseUrl}/klien/meal-logs`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ namaMakanan: uniqueRace, porsiGram: 150 })
    });
    const [resRace1, resRace2] = await Promise.all([req1, req2]);
    console.log(`2c. Result 1: [${resRace1.status}], Result 2: [${resRace2.status}]`);
    
    const countQuery = await db.select({ count: sql<number>`count(*)` }).from(masterMakanan).where(sql`LOWER(nama) = LOWER(${uniqueRace})`);
    console.log(`    DB Verifikasi Row Count (SELECT COUNT(*) FROM master_makanan WHERE nama = '${uniqueRace}'): ${countQuery[0].count} row(s)`);


    console.log("\n=== TEST 3: GET /klien/weekly-plan/current ===");
    await db.delete(weeklyPlans).where(eq(weeklyPlans.klienId, klienProfile!.id));

    const res3a = await fetch(`${baseUrl}/klien/weekly-plan/current`, { headers: authHeaders });
    console.log(`3a. [${res3a.status}] Response: ${await res3a.text()}`);

    const date = new Date();
    const day = date.getDay() || 7;
    date.setHours(-24 * (day - 1));
    const startOfWeek = date.toISOString().slice(0, 10);
    
    const [insertPlan] = await db.insert(weeklyPlans).values({
      klienId: klienProfile!.id,
      mingguMulai: startOfWeek,
      workoutPlan: [], mealPlan: [],
      status: "pending_review"
    });
    const planId = insertPlan.insertId;

    const res3b = await fetch(`${baseUrl}/klien/weekly-plan/current`, { headers: authHeaders });
    console.log(`3b. [${res3b.status}] Response: ${await res3b.text()}`);

    await db.update(weeklyPlans).set({ status: "disetujui" }).where(eq(weeklyPlans.id, planId));
    const res3c = await fetch(`${baseUrl}/klien/weekly-plan/current`, { headers: authHeaders });
    console.log(`3c. [${res3c.status}] Response: ${await res3c.text()}`);

  } finally {
    server.close();
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
