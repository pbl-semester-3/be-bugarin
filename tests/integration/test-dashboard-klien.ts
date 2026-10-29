/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-dashboard-klien.ts
 *
 * CATATAN:
 * - Script ini mengatur (seed) datanya sendiri di database lokal.
 * - Butuh database lokal aktif (docker-compose up -d). Server HTTP dijalankan sendiri lewat createApp().
 * - Script ini bukan bagian dari test suite otomatis, jalankan manual.
 * - Setiap klien di-seed dengan userId != klienProfileId (profile di-insert dengan id eksplisit
 *   yang jauh dari urutan user) supaya bug ownership tidak tersembunyi oleh ID yang kebetulan sama.
 * - Streak kini akumulatif per siklus (tidak pernah reset dalam siklus). Lihat CATATAN.md.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import {
  users,
  ptProfiles,
  klienProfiles,
  progressCycles,
  weeklyPlans,
  weightLogs,
  activityLogs,
  mealLogs,
  masterOlahraga,
  masterMakanan,
  feedbacks,
} from "../../src/db/schema";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";
import { recalculateActiveCycleStreak } from "../../src/modules/klien/klien.service";
import { getStartOfWeekUtc } from "../../src/utils/week";

const PORT = 9992;

let counter = 0;
function uniq(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftUtcDate(dateStr: string, deltaDays: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
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

type SeededKlien = { userId: number; profileId: number; token: string; auth: Record<string, string> };

async function createKlien(label: string): Promise<SeededKlien> {
  const userInsert = await db.insert(users).values({
    email: `${uniq(`dash_${label}`)}@test.com`,
    username: uniq(`dash_${label}`),
    passwordHash: "hash",
    role: "klien",
  });
  const userId = userInsert[0].insertId;
  const profileId = userId + 500_000_000;

  await db.insert(klienProfiles).values({
    id: profileId,
    userId,
    nama: `Dashboard ${label}`,
  });

  if (userId === profileId) throw new Error("userId harus berbeda dari klienProfileId");

  const token = jwt.sign({ sub: userId, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
  return { userId, profileId, token, auth: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

async function seedCycle(
  klienId: number,
  opts: { tanggalMulai: string; durasiHari?: number; target?: number; status?: "aktif" | "selesai"; tanggalSelesai?: string | null },
): Promise<number> {
  const insert = await db.insert(progressCycles).values({
    klienId,
    bbAwalKg: 70,
    bbTujuanKg: 65,
    tujuan: "turun_bb",
    durasiHari: opts.durasiHari ?? 30,
    targetKaloriPerHari: opts.target ?? 1800,
    status: opts.status ?? "aktif",
    tanggalMulai: opts.tanggalMulai,
    tanggalSelesai: opts.tanggalSelesai ?? null,
  });
  return insert[0].insertId;
}

async function getSummary(baseUrl: string, auth: Record<string, string>) {
  const res = await fetch(`${baseUrl}/klien/dashboard-summary`, { headers: auth });
  const body = await res.json();
  return { status: res.status, body };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;
  const today = todayUtc();

  try {
    console.log("\n=== SETUP DATA TEST ===");
    const D1 = shiftUtcDate(today, -1);
    const D2 = shiftUtcDate(today, -2);
    const D3 = shiftUtcDate(today, -3);
    const D4 = shiftUtcDate(today, -4);
    const D5 = shiftUtcDate(today, -5);

    let olahraga = await db.query.masterOlahraga.findFirst({
      where: and(eq(masterOlahraga.butuhJarak, false), eq(masterOlahraga.butuhBeban, false)),
    });
    if (!olahraga) {
      const ins = await db.insert(masterOlahraga).values({ nama: uniq("Yoga"), metValue: 3, kategori: "fleksibilitas", butuhJarak: false, butuhBeban: false });
      olahraga = await db.query.masterOlahraga.findFirst({ where: eq(masterOlahraga.id, ins[0].insertId) });
    }
    let makanan = await db.query.masterMakanan.findFirst();
    if (!makanan) {
      const ins = await db.insert(masterMakanan).values({ nama: uniq("Nasi"), kaloriPer100g: 100, kategori: "karbohidrat" });
      makanan = await db.query.masterMakanan.findFirst({ where: eq(masterMakanan.id, ins[0].insertId) });
    }

    const seedActivity = (klienId: number, tanggal: string) =>
      db.insert(activityLogs).values({ klienId, olahragaId: olahraga!.id, durasiMenit: 30, kaloriTerbakar: 100, tanggal });
    const seedMeal = (klienId: number, tanggal: string) =>
      db.insert(mealLogs).values({ klienId, makananId: makanan!.id, porsiGram: 100, kaloriMasuk: 100, tanggal });
    const seedWeight = (klienId: number, tanggal: string) =>
      db.insert(weightLogs).values({ klienId, beratBadanKg: 70, tanggal });

    const postJson = (path: string, auth: Record<string, string>, body: unknown) =>
      fetch(`${baseUrl}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });

    // PT
    const ptHash = await argon2.hash("password123");
    const ptUser = await db.insert(users).values({ email: `${uniq("pt_dash")}@test.com`, username: uniq("pt_dash"), passwordHash: ptHash, role: "pt" });
    const ptProfile = await db.insert(ptProfiles).values({ userId: ptUser[0].insertId, nama: "PT Dashboard", spesialisasi: "turun_bb", tempatGym: "Gym Dash" });
    const ptId = ptProfile[0].insertId;

    const startOfWeek = getStartOfWeekUtc();
    const workoutItem = { hari: "Senin", jam: "16:00", jenis: "Upper Body", lokasi: "Gym Dash" };

    // K0: tanpa PT, TANPA cycle aktif, ada histori log (membuktikan streak 0 tanpa siklus)
    const K0 = await createKlien("k0");
    await seedActivity(K0.profileId, D1);
    await seedMeal(K0.profileId, D2);

    // K1: weekly_plan pending_review + 1 feedback unread
    const K1 = await createKlien("k1");
    await db.insert(weeklyPlans).values({ klienId: K1.profileId, mingguMulai: startOfWeek, workoutPlan: [workoutItem], mealPlan: [], status: "pending_review" });
    await db.insert(feedbacks).values({ klienId: K1.profileId, ptId: null, source: "ai", pesan: "fb", dibaca: false });
    await db.insert(feedbacks).values({ klienId: K1.profileId, ptId: null, source: "ai", pesan: "sudah dibaca", dibaca: true });

    // K2: PT, cycle aktif start hari ini, plan disetujui, 2 feedback unread. Streak diuji via API.
    const K2 = await createKlien("k2");
    await db.update(klienProfiles).set({ ptId }).where(eq(klienProfiles.id, K2.profileId));
    await seedCycle(K2.profileId, { tanggalMulai: today, target: 1800 });
    await seedWeight(K2.profileId, today);
    await db.insert(weeklyPlans).values({ klienId: K2.profileId, mingguMulai: startOfWeek, workoutPlan: [workoutItem], mealPlan: [], status: "disetujui" });
    await db.insert(feedbacks).values({ klienId: K2.profileId, ptId, source: "pt", pesan: "a", dibaca: false });
    await db.insert(feedbacks).values({ klienId: K2.profileId, ptId, source: "pt", pesan: "b", dibaca: false });
    await db.insert(feedbacks).values({ klienId: K2.profileId, ptId, source: "pt", pesan: "c", dibaca: true });

    // K3: plan override
    const K3 = await createKlien("k3");
    await db.insert(weeklyPlans).values({ klienId: K3.profileId, mingguMulai: startOfWeek, workoutPlan: [workoutItem], mealPlan: [], status: "override" });

    // K4: cycle start D3, log D3/D2/D1, tidak log hari ini -> streak 3 (beku)
    const K4 = await createKlien("k4");
    await seedCycle(K4.profileId, { tanggalMulai: D3 });
    await seedActivity(K4.profileId, D3);
    await seedActivity(K4.profileId, D2);
    await seedMeal(K4.profileId, D1);
    const streakK4 = await recalculateActiveCycleStreak(K4.profileId);

    // K5: cycle start D3, log D3/D2/D1, plus log hari ini via API -> streak 4
    const K5 = await createKlien("k5");
    await seedCycle(K5.profileId, { tanggalMulai: D3 });
    await seedWeight(K5.profileId, today);
    await seedActivity(K5.profileId, D3);
    await seedActivity(K5.profileId, D2);
    await seedMeal(K5.profileId, D1);

    // K6: cycle start D4, log D4/D3, lalu gap (tidak ada log) -> streak beku 2, lanjut ke 3 saat log lagi
    const K6 = await createKlien("k6");
    await seedCycle(K6.profileId, { tanggalMulai: D4 });
    await seedWeight(K6.profileId, today);
    await seedActivity(K6.profileId, D4);
    await seedActivity(K6.profileId, D3);
    const streakK6Awal = await recalculateActiveCycleStreak(K6.profileId);
    const streakK6Gap = await recalculateActiveCycleStreak(K6.profileId);

    // K7: cycle start D2, D1 hanya activity, D2 hanya meal -> streak 2 (OR lintas hari)
    const K7 = await createKlien("k7");
    await seedCycle(K7.profileId, { tanggalMulai: D2 });
    await seedActivity(K7.profileId, D1);
    await seedMeal(K7.profileId, D2);
    const streakK7 = await recalculateActiveCycleStreak(K7.profileId);

    // K8: cycle aktif lewat durasi -> reminder true
    const K8 = await createKlien("k8");
    await seedCycle(K8.profileId, { tanggalMulai: shiftUtcDate(today, -40), durasiHari: 30, target: 1700 });

    // K9: cycle selesai meski durasi lewat -> reminder false, target null, streak 0
    const K9 = await createKlien("k9");
    await seedCycle(K9.profileId, { tanggalMulai: shiftUtcDate(today, -40), durasiHari: 30, target: 1700, status: "selesai", tanggalSelesai: shiftUtcDate(today, -5) });

    // K10: reset streak saat siklus baru
    const K10 = await createKlien("k10");
    await seedWeight(K10.profileId, today);
    const cycleLamaId = await seedCycle(K10.profileId, { tanggalMulai: D5 });
    await seedActivity(K10.profileId, D5);
    await seedActivity(K10.profileId, D4);
    await seedActivity(K10.profileId, D3);
    const streakCycleLama = await recalculateActiveCycleStreak(K10.profileId);
    await db.update(progressCycles).set({ status: "selesai", tanggalSelesai: D2 }).where(eq(progressCycles.id, cycleLamaId));
    await seedCycle(K10.profileId, { tanggalMulai: D1 });

    console.log(`Seed selesai. streak K4=${streakK4}, K6 awal=${streakK6Awal}/gap=${streakK6Gap}, K7=${streakK7}, K10 cycle lama=${streakCycleLama}`);

    console.log("\n=== MULAI TES HTTP GET /klien/dashboard-summary ===");

    // [a] & [b]
    {
      const { status, body } = await getSummary(baseUrl, K0.auth);
      console.log(`[a/b] K0 raw: [${status}] ${JSON.stringify(body)}`);
      check("a. Klien tanpa PT -> pt null", status === 200 && body.data.pt === null, body);
      check("b. tanpa cycle aktif -> targetKaloriHariIni null", body.data.targetKaloriHariIni === null, body);
      check("b. tanpa cycle aktif -> isReminderActive false", body.data.isReminderActive === false, body);
      check("b. tanpa cycle aktif -> jadwalMingguan []", Array.isArray(body.data.jadwalMingguan) && body.data.jadwalMingguan.length === 0, body);
      check("b. tanpa cycle aktif -> streak 0 walau ada histori log", body.data.streak === 0, body);
    }

    // [c]
    {
      const { body } = await getSummary(baseUrl, K1.auth);
      console.log(`[c] K1 raw: ${JSON.stringify(body)}`);
      check("c. weekly_plans pending_review -> jadwalMingguan []", Array.isArray(body.data.jadwalMingguan) && body.data.jadwalMingguan.length === 0, body);
    }

    // [d] & [l] & [m] + OR same-day dedupe untuk K2
    {
      await postJson("/klien/activity-logs", K2.auth, { olahragaId: olahraga!.id, durasiMenit: 30 });
      const afterActivity = await getSummary(baseUrl, K2.auth);
      await postJson("/klien/meal-logs", K2.auth, { makananId: makanan!.id, porsiGram: 200 });
      const afterMeal = await getSummary(baseUrl, K2.auth);
      console.log(`[d/l/m] K2 setelah activity: ${JSON.stringify(afterActivity.body)}`);
      console.log(`[d/l/m] K2 setelah meal:     ${JSON.stringify(afterMeal.body)}`);

      check("d. weekly_plans disetujui -> jadwalMingguan tampil", Array.isArray(afterMeal.body.data.jadwalMingguan) && afterMeal.body.data.jadwalMingguan.length === 1, afterMeal.body);
      check("d. item jadwal lengkap", afterMeal.body.data.jadwalMingguan[0]?.hari === workoutItem.hari && afterMeal.body.data.jadwalMingguan[0]?.lokasi === workoutItem.lokasi, afterMeal.body);
      check("d. targetKaloriHariIni dari cycle aktif (1800)", afterMeal.body.data.targetKaloriHariIni === 1800, afterMeal.body);
      check("l. unreadFeedbackCount hanya dibaca=false (2)", afterMeal.body.data.unreadFeedbackCount === 2, afterMeal.body);
      check("m. pt object milik klien yang benar", afterMeal.body.data.pt?.id === ptId && afterMeal.body.data.pt?.spesialisasi === "turun_bb", afterMeal.body);
      check("streak naik ke 1 setelah activity hari ini", afterActivity.body.data.streak === 1, afterActivity.body);
      check("OR same-day: meal setelah activity tetap streak 1", afterMeal.body.data.streak === 1, afterMeal.body);
    }

    // [e]
    {
      const { body } = await getSummary(baseUrl, K3.auth);
      console.log(`[e] K3 raw: ${JSON.stringify(body)}`);
      check("e. weekly_plans override -> jadwalMingguan tetap tampil", Array.isArray(body.data.jadwalMingguan) && body.data.jadwalMingguan.length === 1, body);
    }

    // [f]
    {
      const { body } = await getSummary(baseUrl, K4.auth);
      console.log(`[f] K4 raw: ${JSON.stringify(body)}`);
      check("f. log 3 hari (D3-D1), belum log hari ini -> streak 3, tidak reset", streakK4 === 3 && body.data.streak === 3, body);
    }

    // [g]
    {
      await postJson("/klien/meal-logs", K5.auth, { makananId: makanan!.id, porsiGram: 100 });
      const { body } = await getSummary(baseUrl, K5.auth);
      console.log(`[g] K5 raw: ${JSON.stringify(body)}`);
      check("g. log 3 hari + hari ini -> streak 4 (lanjut dari 3)", body.data.streak === 4, body);
    }

    // [h] gap tidak reset + lanjut saat log lagi
    {
      check("h1. gap: streak beku di 2 (tidak reset 0)", streakK6Awal === 2 && streakK6Gap === 2, { streakK6Awal, streakK6Gap });
      const beforeResume = await getSummary(baseUrl, K6.auth);
      console.log(`[h] K6 sebelum resume: ${JSON.stringify(beforeResume.body)}`);
      check("h2. dashboard saat gap -> streak 2", beforeResume.body.data.streak === 2, beforeResume.body);
      await postJson("/klien/activity-logs", K6.auth, { olahragaId: olahraga!.id, durasiMenit: 30 });
      const afterResume = await getSummary(baseUrl, K6.auth);
      console.log(`[h] K6 setelah resume: ${JSON.stringify(afterResume.body)}`);
      check("h3. lanjut dari 2 -> 3 saat log lagi", afterResume.body.data.streak === 3, afterResume.body);
    }

    // [i]
    {
      const { body } = await getSummary(baseUrl, K7.auth);
      console.log(`[i] K7 raw: ${JSON.stringify(body)}`);
      check("i. OR lintas hari (activity-only & meal-only) -> streak 2", streakK7 === 2 && body.data.streak === 2, body);
    }

    // [j]
    {
      const { body } = await getSummary(baseUrl, K8.auth);
      console.log(`[j] K8 raw: ${JSON.stringify(body)}`);
      check("j. cycle aktif lewat durasi & belum selesai -> isReminderActive true", body.data.isReminderActive === true, body);
    }

    // [k]
    {
      const { body } = await getSummary(baseUrl, K9.auth);
      console.log(`[k] K9 raw: ${JSON.stringify(body)}`);
      check("k. cycle selesai meski durasi lewat -> isReminderActive false", body.data.isReminderActive === false, body);
      check("k. tidak ada cycle aktif -> targetKaloriHariIni null", body.data.targetKaloriHariIni === null, body);
      check("k. cycle selesai bukan aktif -> streak 0", body.data.streak === 0, body);
    }

    // [reset siklus baru]
    {
      const { body } = await getSummary(baseUrl, K10.auth);
      console.log(`[reset] K10 raw: ${JSON.stringify(body)}`);
      check("reset. cycle lama streak 3, siklus baru mulai dari 0", streakCycleLama === 3 && body.data.streak === 0, body);
      await postJson("/klien/activity-logs", K10.auth, { olahragaId: olahraga!.id, durasiMenit: 30 });
      const after = await getSummary(baseUrl, K10.auth);
      console.log(`[reset] K10 setelah log di siklus baru: ${JSON.stringify(after.body)}`);
      check("reset. siklus baru menghitung ulang dari 1 (bukan 4)", after.body.data.streak === 1, after.body);
    }

    // [m] isolasi ownership
    {
      const k1 = await getSummary(baseUrl, K1.auth);
      const k2 = await getSummary(baseUrl, K2.auth);
      console.log(`[m] K1 raw: ${JSON.stringify(k1.body)}`);
      check("m. K1 tidak melihat data K2 (pt tetap null)", k1.body.data.pt === null, k1.body);
      check("m. K1 unreadFeedbackCount tidak tercampur K2 (=1)", k1.body.data.unreadFeedbackCount === 1, k1.body);
      check("m. K2 tidak melihat data K1 (pt object)", k2.body.data.pt?.id === ptId, k2.body);
    }

    console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed} ===`);
    if (failed > 0) process.exit(1);
  } catch (error) {
    console.error("Fatal Test error:", error);
    process.exit(1);
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
