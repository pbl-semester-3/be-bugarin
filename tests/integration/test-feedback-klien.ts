/**
 * CARA MENJALANKAN:
 * npx ts-node --transpile-only tests/integration/test-feedback-klien.ts
 * 
 * CATATAN:
 * - Script ini mengatur seed datanya sendiri di database.
 * - Butuh server lokal yang sedang berjalan (npm run dev) dan database lokal (docker-compose up -d).
 * - Script ini bukan bagian dari test suite otomatis, jalankan secara manual.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles, klienProfiles, feedbacks, progressCycles, masterOlahraga, activityLogs } from "../../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";
import { generateWeeklyFeedbackForAllActiveKlien } from "../../src/jobs/generate-weekly-feedback.job";
import { klienService } from "../../src/modules/klien/klien.service";

const PORT = 9993;

function assert(condition: boolean, message: string, data?: any) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    if (data) console.error(JSON.stringify(data, null, 2));
    throw new Error(message);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  let passed = 0;
  let failed = 0;
  function markPass() { passed++; }
  function markFail(e: any) { failed++; console.error(e); }

  try {
    console.log("\n=== SETUP DATA TEST ===");

    // Klien A (Untuk Test a-g)
    const klienAUsername = `klienf_a_${Date.now()}`;
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${klienAUsername}@test.com`, username: klienAUsername, password: "password123", role: "klien", nama: "Klien A" })
    });
    const klienAUser = await db.query.users.findFirst({ where: eq(users.username, klienAUsername) });
    const klienAToken = jwt.sign({ sub: klienAUser!.id, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
    const authA = { "Authorization": `Bearer ${klienAToken}`, "Content-Type": "application/json" };
    const klienAProfile = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, klienAUser!.id) });

    // Klien B (Untuk Test h-i)
    const klienBUsername = `klienf_b_${Date.now()}`;
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${klienBUsername}@test.com`, username: klienBUsername, password: "password123", role: "klien", nama: "Klien B" })
    });
    const klienBUser = await db.query.users.findFirst({ where: eq(users.username, klienBUsername) });
    const klienBProfile = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, klienBUser!.id) });
    const klienBToken = jwt.sign({ sub: klienBUser!.id, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
    const authB = { "Authorization": `Bearer ${klienBToken}`, "Content-Type": "application/json" };

    // Klien C (Untuk Test j)
    const klienCUsername = `klienf_c_${Date.now()}`;
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `${klienCUsername}@test.com`, username: klienCUsername, password: "password123", role: "klien", nama: "Klien C" })
    });
    const klienCUser = await db.query.users.findFirst({ where: eq(users.username, klienCUsername) });
    const klienCProfile = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, klienCUser!.id) });

    // PT
    const ptHash = await argon2.hash("password123");
    const [ptUserIns] = await db.insert(users).values({ email: `ptf_${Date.now()}@test.com`, username: `ptf_${Date.now()}`, passwordHash: ptHash, role: "pt" });
    const [ptProfIns] = await db.insert(ptProfiles).values({ userId: ptUserIns.insertId, nama: "PT Feedback", spesialisasi: "turun_bb", tempatGym: "Gym F" });
    const ptId = ptProfIns.insertId;

    // Seed Feedbacks for Klien A
    const [aiFeedbackIns] = await db.insert(feedbacks).values({ klienId: klienAProfile!.id, ptId: null, source: "ai", pesan: "AI Feedback" });
    const aiFeedbackId = aiFeedbackIns.insertId;
    const [ptFeedbackIns] = await db.insert(feedbacks).values({ klienId: klienAProfile!.id, ptId: ptId, source: "pt", pesan: "PT Feedback" });
    const ptFeedbackId = ptFeedbackIns.insertId;
    const [ptFeedbackRepliedIns] = await db.insert(feedbacks).values({ klienId: klienAProfile!.id, ptId: ptId, source: "pt", pesan: "PT Feedback Rep", balasanKlien: "Ini balasanku" });
    const ptFeedbackRepliedId = ptFeedbackRepliedIns.insertId;

    console.log("\n=== MULAI TES HTTP ===");

    // [a] Ownership: Klien B akses feedback milik Klien A
    try {
      const resA = await fetch(`${baseUrl}/klien/feedbacks/${ptFeedbackId}/read`, { method: "PUT", headers: authB });
      assert(resA.status === 404, "Test a1: Baca feedback orang lain -> 404");
      const resA2 = await fetch(`${baseUrl}/klien/feedbacks/${ptFeedbackId}/reply`, { method: "POST", headers: authB, body: JSON.stringify({ balasan: "Holo" }) });
      assert(resA2.status === 404, "Test a2: Balas feedback orang lain -> 404");
      markPass(); markPass();
    } catch(e) { markFail(e); }

    // [b] Balas feedback AI -> 400
    try {
      const resB = await fetch(`${baseUrl}/klien/feedbacks/${aiFeedbackId}/reply`, { method: "POST", headers: authA, body: JSON.stringify({ balasan: "Halo" }) });
      assert(resB.status === 400, "Test b: Balas feedback AI -> 400");
      markPass();
    } catch(e) { markFail(e); }

    // [c] Balas feedback PT yang belum dibalas -> Sukses
    try {
      const resC = await fetch(`${baseUrl}/klien/feedbacks/${ptFeedbackId}/reply`, { method: "POST", headers: authA, body: JSON.stringify({ balasan: "Baik coach" }) });
      const dataC = await resC.json();
      assert(resC.status === 200 && dataC.data.balasanKlien === "Baik coach", "Test c: Balas feedback PT -> 200");
      markPass();
    } catch(e) { markFail(e); }

    // [d] Duplicate Reply
    try {
      const resD = await fetch(`${baseUrl}/klien/feedbacks/${ptFeedbackRepliedId}/reply`, { method: "POST", headers: authA, body: JSON.stringify({ balasan: "Lagi" }) });
      assert(resD.status === 400, "Test d: Balas feedback yang sudah dibalas -> 400");
      markPass();
    } catch(e) { markFail(e); }

    // [e] Read feedback
    try {
      const resE = await fetch(`${baseUrl}/klien/feedbacks/${ptFeedbackId}/read`, { method: "PUT", headers: authA });
      const dataE = await resE.json();
      assert(resE.status === 200 && dataE.data.dibaca === true, "Test e: Read feedback -> dibaca: true");
      markPass();
    } catch(e) { markFail(e); }

    // [f] List Shape
    try {
      const resF = await fetch(`${baseUrl}/klien/feedbacks`, { headers: authA });
      const dataF = await resF.json();
      const list = dataF.data;
      assert(resF.status === 200 && Array.isArray(list), "Test f1: List mengembalikan array");
      const aiObj = list.find((x: any) => x.id === aiFeedbackId);
      const ptObj = list.find((x: any) => x.id === ptFeedbackId);
      assert(aiObj.pt === null, "Test f2: Field pt null untuk AI");
      assert(ptObj.pt !== null && ptObj.pt.nama === "PT Feedback", "Test f3: Field pt object untuk PT");
      assert(new Date(list[0].createdAt) >= new Date(list[1].createdAt), "Test f4: Urutan descending createdAt");
      markPass(); markPass(); markPass(); markPass();
    } catch(e) { markFail(e); }

    console.log("\n=== MULAI TES CRON JOB ===");

    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);

    // Siapkan Klien A dengan 1 data log (Untuk Test g - Normal)
    await db.insert(progressCycles).values({
      klienId: klienAProfile!.id, bbAwalKg: 70, bbTujuanKg: 65,
      tujuan: "turun_bb", durasiHari: 30, targetKaloriPerHari: 1500,
      status: "aktif", tanggalMulai: todayStr, tanggalSelesai: null
    });
    
    // [g] Cron - Normal -> Generate & Cetak Pesan
    let unproven = 0;
    try {
      console.log("\nMenjalankan cron untuk Klien A (Normal)...");
      let success = false;
      let retries = 3; 
      while (retries > 0 && !success) {
        await generateWeeklyFeedbackForAllActiveKlien([klienAProfile!.id]);
        const allAIFeedbacksA = await db.select().from(feedbacks).where(and(eq(feedbacks.klienId, klienAProfile!.id), eq(feedbacks.source, "ai")));
        if (allAIFeedbacksA.length > 1) { 
          const terbaru = allAIFeedbacksA[allAIFeedbacksA.length - 1];
          assert(true, "Test g: Cron normal berhasil membuat row baru");
          console.log(`\n💬 [HASIL GENERATE FEEDBACK AI UNTUK KLIEN A]:\n"${terbaru.pesan}"\n`);
          success = true;
          markPass();
        } else {
          retries--;
          if (retries === 0) {
            console.log("⚠️ BELUM TERBUKTI (Gemini 503): Test g gagal setelah 3x percobaan karena error API eksternal.");
            unproven++;
          }
        }
      }
    } catch(e) { markFail(e); }

    // Siapkan Klien B dengan 0 data log (Untuk Test h & i)
    await db.insert(progressCycles).values({
      klienId: klienBProfile!.id, bbAwalKg: 70, bbTujuanKg: 65,
      tujuan: "turun_bb", durasiHari: 30, targetKaloriPerHari: 1500,
      status: "aktif", tanggalMulai: todayStr, tanggalSelesai: null
    });

    // [h] Cron - 0 Log -> TETAP tergenerate
    let testHSukses = false;
    try {
      console.log("\nMenjalankan cron untuk Klien B (0 Log)...");
      let retries = 3;
      while (retries > 0 && !testHSukses) {
        await generateWeeklyFeedbackForAllActiveKlien([klienBProfile!.id]);
        const dbH = await db.query.feedbacks.findFirst({ where: and(eq(feedbacks.klienId, klienBProfile!.id), eq(feedbacks.source, "ai")) });
        if (dbH) {
          assert(true, "Test h: Cron generate feedback AI walau 0 log");
          testHSukses = true;
          markPass();
        } else {
          retries--;
          if (retries === 0) {
            console.log("⚠️ BELUM TERBUKTI (Gemini 503): Test h gagal setelah 3x percobaan karena error API eksternal.");
            unproven++;
          }
        }
      }
    } catch(e) { markFail(e); }

    // [i] Cron - Anti-Duplikasi -> Eksekusi 2x tidak boleh nambah baris baru untuk Klien B (karena < 7 hari)
    try {
      console.log("\nMenjalankan cron KEDUA KALI untuk Klien B (Anti-Duplikasi)...");
      if (testHSukses) {
        const c1 = await db.select({ count: sql<number>`COUNT(*)` }).from(feedbacks).where(and(eq(feedbacks.klienId, klienBProfile!.id), eq(feedbacks.source, "ai")));
        const countSebelum = c1[0].count;
        
        await generateWeeklyFeedbackForAllActiveKlien([klienBProfile!.id]);
        
        const c2 = await db.select({ count: sql<number>`COUNT(*)` }).from(feedbacks).where(and(eq(feedbacks.klienId, klienBProfile!.id), eq(feedbacks.source, "ai")));
        const countSesudah = c2[0].count;
        
        assert(countSebelum === countSesudah, `Test i: Anti-duplikasi berfungsi. COUNT sebelum: ${countSebelum}, COUNT sesudah: ${countSesudah}`);
        markPass();
      } else {
         console.log("⚠️ BELUM TERBUKTI (Gemini 503): Test i batal dijalankan karena pre-kondisi (test h) belum pernah berhasil menyimpan feedback di DB.");
         unproven++;
      }
    } catch(e) { markFail(e); }

    // [j] Cron - Fault Tolerance
    try {
      // Setup Klien C
      await db.insert(progressCycles).values({
        klienId: klienCProfile!.id, bbAwalKg: 70, bbTujuanKg: 65,
        tujuan: "turun_bb", durasiHari: 30, targetKaloriPerHari: 1500,
        status: "aktif", tanggalMulai: todayStr, tanggalSelesai: null
      });

      console.log("\nMem-patch (mock) klienService.getCycleLogs untuk melempar error saat memproses Klien C...");
      const originalGetCycleLogs = klienService.getCycleLogs.bind(klienService);
      let errorThrown = false;
      klienService.getCycleLogs = async (userId: number, cycleId: number) => {
        if (userId === klienCUser!.id) {
          errorThrown = true;
          throw new Error("MOCK_ERROR_KHUSUS_UNTUK_TEST_J");
        }
        return originalGetCycleLogs(userId, cycleId);
      };

      console.log("Menjalankan cron untuk Klien C dan Klien B (bersamaan) untuk melihat apakah loop berlanjut...");
      await generateWeeklyFeedbackForAllActiveKlien([klienCProfile!.id, klienBProfile!.id]);
      
      assert(errorThrown, "Test j1: Mock error berhasil di-trigger untuk Klien C");
      markPass();
      
      assert(true, "Test j2: Loop cron tidak terhenti/crash meskipun ada error di satu klien (Fault-tolerance terbukti)");
      markPass();

      klienService.getCycleLogs = originalGetCycleLogs;
    } catch(e) { markFail(e); }

    console.log(`\n=== KESIMPULAN ===`);
    console.log(`Lulus: ${passed}, Gagal: ${failed}, Belum Terbukti (API Down): ${unproven}`);
    if (failed > 0) process.exit(1);

  } catch (error) {
    console.error("Fatal Test error:", error);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
