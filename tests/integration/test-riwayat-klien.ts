/**
 * CARA MENJALANKAN:
 * npx ts-node --transpile-only tests/integration/test-riwayat-klien.ts
 * 
 * CATATAN:
 * - Script ini mengatur seed datanya sendiri di database.
 * - Butuh server lokal yang sedang berjalan (npm run dev) dan database lokal (docker-compose up -d).
 * - Script ini bukan bagian dari test suite otomatis, jalankan secara manual.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, klienProfiles, ptProfiles, progressCycles, activityLogs, mealLogs, masterMakanan, masterOlahraga } from "../../src/db/schema";
import { eq, sql, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9997;

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("=== SETUP DATA TEST ===");

    // 1. Buat PT (agar users.id bergeser dan klien_profiles.id != users.id)
    const ptHash = await argon2.hash("password123");
    const [ptUserInsert] = await db.insert(users).values({
      email: `pt_riwayat_${Date.now()}@test.com`,
      username: `pt_riwayat_${Date.now()}`,
      passwordHash: ptHash,
      role: "pt",
    });
    const ptUserId = ptUserInsert.insertId;
    await db.insert(ptProfiles).values({
      userId: ptUserId,
      nama: "PT Riwayat Test",
      spesialisasi: "turun_bb",
      tempatGym: "Gym Riwayat",
    });

    const ptToken = jwt.sign({ sub: ptUserId, role: "pt" }, env.JWT_SECRET, { expiresIn: "1d" });
    const ptAuth = { "Authorization": `Bearer ${ptToken}`, "Content-Type": "application/json" };

    // 2. Buat Klien A dan Klien B
    const createKlien = async (suffix: string) => {
      const username = `klien_riwayat_${suffix}_${Date.now()}`;
      const [userInsert] = await db.insert(users).values({
        email: `${username}@test.com`,
        username,
        passwordHash: ptHash,
        role: "klien",
      });
      const userId = userInsert.insertId;
      const [profInsert] = await db.insert(klienProfiles).values({
        userId,
        nama: `Klien ${suffix}`,
        tinggiBadanCm: 170,
        usia: 25,
        jenisKelamin: "pria",
      });
      const token = jwt.sign({ sub: userId, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
      return { 
        userId, 
        profileId: profInsert.insertId, 
        token, 
        auth: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } 
      };
    };

    const klienA = await createKlien("A");
    const klienB = await createKlien("B");

    // Pastikan userId dan profileId Klien A berbeda untuk validasi strict ownership bug
    console.log(`Klien A - userId: ${klienA.userId}, profileId: ${klienA.profileId}`);
    console.log(`Klien B - userId: ${klienB.userId}, profileId: ${klienB.profileId}`);
    if (klienA.userId === klienA.profileId) {
      console.warn("WARNING: userId dan profileId kebetulan sama. Validasi poin 1 mungkin kurang tajam.");
    }

    // 3. Setup Cycles untuk Klien A
    const today = new Date();
    const toDateString = (d: Date) => d.toISOString().slice(0, 10);
    
    // Cycle 1: Selesai (30 hari lalu s/d 10 hari lalu)
    const d30 = new Date(today); d30.setDate(d30.getDate() - 30);
    const d10 = new Date(today); d10.setDate(d10.getDate() - 10);
    const [c1Insert] = await db.insert(progressCycles).values({
      klienId: klienA.profileId,
      bbAwalKg: 80, bbTujuanKg: 75, tujuan: "turun_bb",
      durasiHari: 30, targetKaloriPerHari: 2000,
      status: "selesai",
      tanggalMulai: toDateString(d30),
      tanggalSelesai: toDateString(d10),
    });
    const cycleSelesaiId = c1Insert.insertId;

    // Cycle 2: Aktif (5 hari lalu s/d sekarang)
    const d5 = new Date(today); d5.setDate(d5.getDate() - 5);
    const [c2Insert] = await db.insert(progressCycles).values({
      klienId: klienA.profileId,
      bbAwalKg: 76, bbTujuanKg: 72, tujuan: "turun_bb",
      durasiHari: 30, targetKaloriPerHari: 1900,
      status: "aktif",
      tanggalMulai: toDateString(d5),
      tanggalSelesai: null,
    });
    const cycleAktifId = c2Insert.insertId;

    // Cycle 3: Selesai tanpa log
    const d40 = new Date(today); d40.setDate(d40.getDate() - 40);
    const d35 = new Date(today); d35.setDate(d35.getDate() - 35);
    const [c3Insert] = await db.insert(progressCycles).values({
      klienId: klienA.profileId,
      bbAwalKg: 82, bbTujuanKg: 80, tujuan: "turun_bb",
      durasiHari: 30, targetKaloriPerHari: 2100,
      status: "selesai",
      tanggalMulai: toDateString(d40),
      tanggalSelesai: toDateString(d35),
    });
    const cycleKosongId = c3Insert.insertId;

    // 4. Setup Master Data
    const [olahragaInsert] = await db.insert(masterOlahraga).values({
      nama: `Lari ${Date.now()}`, metValue: 8.0, butuhJarak: true, kategori: "kardio"
    } as any);
    const [makananInsert] = await db.insert(masterMakanan).values({
      nama: `Apel ${Date.now()}`, kaloriPer100g: 52, kategori: "lainnya", sumber: "seed"
    } as any);

    // 5. Setup Logs
    const d31 = new Date(today); d31.setDate(d31.getDate() - 31); // Sehari SEBELUM cycle 1
    const d20 = new Date(today); d20.setDate(d20.getDate() - 20); // Di DALAM cycle 1
    const d9 = new Date(today); d9.setDate(d9.getDate() - 9);    // SEHARI SETELAH cycle 1
    
    const d4 = new Date(today); d4.setDate(d4.getDate() - 4);     // Di DALAM cycle 2 (activity only)
    const d3 = new Date(today); d3.setDate(d3.getDate() - 3);     // Di DALAM cycle 2 (meal only)
    const d2 = new Date(today); d2.setDate(d2.getDate() - 2);     // Di DALAM cycle 2 (keduanya)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); // BESOK (harus tidak muncul)

    // Insert Log Cycle 1
    await db.insert(activityLogs).values([
      // Di luar (sebelum)
      { klienId: klienA.profileId, olahragaId: olahragaInsert.insertId, durasiMenit: 30, kaloriTerbakar: 100, tanggal: toDateString(d31) },
      // Tepat di tanggal mulai
      { klienId: klienA.profileId, olahragaId: olahragaInsert.insertId, durasiMenit: 30, kaloriTerbakar: 150, tanggal: toDateString(d30) },
      // Di dalam
      { klienId: klienA.profileId, olahragaId: olahragaInsert.insertId, durasiMenit: 30, kaloriTerbakar: 200, tanggal: toDateString(d20) },
      // Tepat di tanggal selesai
      { klienId: klienA.profileId, olahragaId: olahragaInsert.insertId, durasiMenit: 30, kaloriTerbakar: 250, tanggal: toDateString(d10) },
      // Lewat 1 hari dari tanggal selesai
      { klienId: klienA.profileId, olahragaId: olahragaInsert.insertId, durasiMenit: 30, kaloriTerbakar: 300, tanggal: toDateString(d9) },
    ]);

    // Insert Log Cycle 2
    await db.insert(activityLogs).values([
      // Hanya activity
      { klienId: klienA.profileId, olahragaId: olahragaInsert.insertId, durasiMenit: 30, kaloriTerbakar: 400, tanggal: toDateString(d4) },
      // Keduanya
      { klienId: klienA.profileId, olahragaId: olahragaInsert.insertId, durasiMenit: 30, kaloriTerbakar: 200, tanggal: toDateString(d2) },
    ]);

    await db.insert(mealLogs).values([
      // Di dalam cycle 1
      { klienId: klienA.profileId, makananId: makananInsert.insertId, porsiGram: 100, kaloriMasuk: 300, tanggal: toDateString(d20) },
      // Cycle 2: Hanya meal
      { klienId: klienA.profileId, makananId: makananInsert.insertId, porsiGram: 100, kaloriMasuk: 350, tanggal: toDateString(d3) },
      // Cycle 2: Keduanya
      { klienId: klienA.profileId, makananId: makananInsert.insertId, porsiGram: 100, kaloriMasuk: 450, tanggal: toDateString(d2) },
      // Cycle 2: Milik Klien B di hari yang sama (seharusnya tak terbaca Klien A)
      { klienId: klienB.profileId, makananId: makananInsert.insertId, porsiGram: 100, kaloriMasuk: 999, tanggal: toDateString(d2) },
      // Cycle 2: Log hari ini (harus muncul)
      { klienId: klienA.profileId, makananId: makananInsert.insertId, porsiGram: 100, kaloriMasuk: 100, tanggal: toDateString(today) },
      // Cycle 2: Log besok (tidak boleh muncul)
      { klienId: klienA.profileId, makananId: makananInsert.insertId, porsiGram: 100, kaloriMasuk: 200, tanggal: toDateString(tomorrow) },
    ]);

    console.log("Setup selesai, menjalankan tests...\n");

    // =====================================
    // TEST RUN
    // =====================================
    let passed = 0;
    let failed = 0;

    const assert = (condition: boolean, name: string, detail?: any) => {
      if (condition) {
        console.log(`✅ PASS: ${name}`);
        passed++;
      } else {
        console.error(`❌ FAIL: ${name}`, detail ? detail : "");
        failed++;
      }
    };

    // Helper GET
    const fetchLogs = async (id: any, auth: any = klienA.auth) => {
      const res = await fetch(`${baseUrl}/klien/progress-cycles/${id}/logs`, { headers: auth });
      const data = await res.json();
      return { status: res.status, data: data as any };
    };

    // Scenarios a-c: Invalid IDs
    const resA = await fetchLogs("abc");
    assert(resA.status === 400 && resA.data?.error === "ID siklus tidak valid", "Test a: id 'abc' -> 400 'ID siklus tidak valid'", resA.data);
    
    const resB = await fetchLogs("-1");
    assert(resB.status === 400 && resB.data?.error === "ID siklus tidak valid", "Test b: id '-1' -> 400 'ID siklus tidak valid'", resB.data);
    
    const resC = await fetchLogs("0");
    assert(resC.status === 400 && resC.data?.error === "ID siklus tidak valid", "Test c: id '0' -> 400 'ID siklus tidak valid'", resC.data);

    // Scenario d: Non-existent cycle
    const resD = await fetchLogs("999999");
    console.log("Body 404 Kasus d (cycle tidak ada):", resD.data);
    assert(resD.status === 404 && resD.data?.error === "Siklus tidak ditemukan", "Test d: Cycle not found -> 404 identik", resD.data);

    // Scenario e: Klien B gets Klien A's cycle
    const resE = await fetchLogs(cycleAktifId, klienB.auth);
    console.log("Body 404 Kasus e (cycle milik orang lain):", resE.data);
    assert(resE.status === 404 && resE.data?.error === "Siklus tidak ditemukan", "Test e: Other client's cycle -> 404 identik", resE.data);

    // Scenario o: No token
    const resO = await fetchLogs(cycleAktifId, {});
    assert(resO.status === 401, "Test o: No token -> 401");

    // Scenario p: PT token
    const resP = await fetchLogs(cycleAktifId, ptAuth);
    assert(resP.status === 403, "Test p: PT token -> 403");

    // Scenario g, h: Completed cycle boundaries
    const resG = await fetchLogs(cycleSelesaiId);
    if (resG.status === 200 && resG.data.data) {
      const logs = resG.data.data;
      const t31 = logs.find((l: any) => l.tanggal === toDateString(d31));
      const t30 = logs.find((l: any) => l.tanggal === toDateString(d30));
      const t20 = logs.find((l: any) => l.tanggal === toDateString(d20));
      const t10 = logs.find((l: any) => l.tanggal === toDateString(d10));
      const t9 = logs.find((l: any) => l.tanggal === toDateString(d9));
      
      assert(t30 !== undefined, "Test h: Log at tanggalMulai appears");
      assert(t10 !== undefined, "Test h: Log at tanggalSelesai appears");
      assert(t31 === undefined, "Test h: Log before tanggalMulai does not appear");
      assert(t9 === undefined, "Test h: Log after tanggalSelesai does not appear");
      assert(t20 && t20.kaloriKeluar === 200 && t20.kaloriMasuk === 300, "Test g: Log inside bounds is correctly mapped");
      assert(resG.data.meta.total === logs.length, "Meta total is correct");
    } else {
      assert(false, "Test g, h: Failed to fetch completed cycle logs", resG);
    }

    // Scenario f, i, j, k, n: Active cycle & specifics
    const resF = await fetchLogs(cycleAktifId);
    if (resF.status === 200 && resF.data.data) {
      const logs = resF.data.data;
      const t4 = logs.find((l: any) => l.tanggal === toDateString(d4));
      const t3 = logs.find((l: any) => l.tanggal === toDateString(d3));
      const t2 = logs.find((l: any) => l.tanggal === toDateString(d2));

      assert(t4 && t4.kaloriKeluar === 400 && t4.kaloriMasuk === 0, "Test j: Day with activity only (kaloriMasuk: 0)");
      assert(t3 && t3.kaloriKeluar === 0 && t3.kaloriMasuk === 350, "Test k: Day with meal only (kaloriKeluar: 0)");
      assert(t2 && t2.kaloriMasuk === 450, "Test i: Klien B's meal is NOT included in Klien A's total (450 not 1449)");
      assert(typeof t2.kaloriMasuk === "number" && typeof t2.kaloriKeluar === "number", "Test n: kalori is number, not string");

      // Tes Cycle Aktif (hari ini muncul, besok tidak)
      assert(logs.find((l: any) => l.tanggal === toDateString(today)), "Test q: Log at today (UTC) appears in active cycle");
      assert(!logs.find((l: any) => l.tanggal === toDateString(tomorrow)), "Test r: Log at tomorrow does NOT appear in active cycle");

      // Pengecekan urutan ascending
      let isAscending = true;
      for (let i = 0; i < logs.length - 1; i++) {
        if (new Date(logs[i].tanggal) > new Date(logs[i+1].tanggal)) {
          isAscending = false;
          break;
        }
      }
      assert(isAscending, "Test s: Data array is sorted ascending by date");
    } else {
      assert(false, "Test f, i, j, k: Failed to fetch active cycle logs", resF);
    }

    // Scenario l: Completed cycle without logs
    const resL = await fetchLogs(cycleKosongId);
    assert(resL.status === 200 && resL.data.data?.length === 0 && resL.data.meta?.total === 0, "Test l: Cycle without logs returns empty array", resL.data);

    // Scenario m: Sum check against raw query
    // Query DB sum for d2 (cycle 2)
    const rawSum = await db.select({
      totalKeluar: sql<string>`SUM(kalori_terbakar)`,
    }).from(activityLogs).where(
      and(
        eq(activityLogs.tanggal, toDateString(d2)),
        eq(activityLogs.klienId, klienA.profileId)
      )
    );
    
    if (resF.data?.data) {
      const logs = resF.data.data;
      const t2 = logs.find((l: any) => l.tanggal === toDateString(d2));
      assert(t2 && t2.kaloriKeluar === Number(rawSum[0].totalKeluar), `Test m: Sum matches DB query (${t2?.kaloriKeluar} == ${rawSum[0].totalKeluar})`);
    } else {
      assert(false, "Test m: Skipped due to previous fail");
    }

    console.log(`\nTest Selesai. Lulus: ${passed}, Gagal: ${failed}`);
    if (failed > 0) process.exit(1);

  } catch (error) {
    console.error("Test error:", error);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests();
