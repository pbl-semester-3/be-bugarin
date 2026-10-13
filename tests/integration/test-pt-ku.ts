import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles, klienProfiles, pairingRequests, weeklyPlans } from "../../src/db/schema";
import { eq, desc } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9998;

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    // === SETUP DATA TEST ===
    console.log("=== SETUP DATA TEST ===");

    // 1. Klien Baru
    const klienUsername = `klien_ptku_${Date.now()}`;
    const registerRes = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${klienUsername}@test.com`,
        username: klienUsername,
        password: "password123",
        role: "klien",
        nama: "Test Klien PT Ku"
      })
    });
    const registerData = await registerRes.json();
    if (registerRes.status !== 201) throw new Error("Gagal register klien: " + JSON.stringify(registerData));

    // Get token by manual sign since register might just return data (assuming login gives JWT or we can just sign it)
    const klienUser = await db.query.users.findFirst({ where: eq(users.username, klienUsername) });
    const klienToken = jwt.sign({ sub: klienUser!.id, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
    const klienAuth = { "Authorization": `Bearer ${klienToken}`, "Content-Type": "application/json" };
    
    // 2. Buat PT Test
    const ptHash = await argon2.hash("password123");
    
    // PT 1: turun_bb
    const [pt1UserInsert] = await db.insert(users).values({
      email: `pt1_${Date.now()}@test.com`,
      username: `pt1_${Date.now()}`,
      passwordHash: ptHash,
      role: "pt",
    });
    const pt1UserId = pt1UserInsert.insertId;
    const [pt1ProfInsert] = await db.insert(ptProfiles).values({
      userId: pt1UserId,
      nama: "PT Turun BB",
      spesialisasi: "turun_bb",
      tempatGym: "Gym A",
    });
    const pt1Id = pt1ProfInsert.insertId;

    // PT 2: naik_bb
    const [pt2UserInsert] = await db.insert(users).values({
      email: `pt2_${Date.now()}@test.com`,
      username: `pt2_${Date.now()}`,
      passwordHash: ptHash,
      role: "pt",
    });
    const pt2UserId = pt2UserInsert.insertId;
    await db.insert(ptProfiles).values({
      userId: pt2UserId,
      nama: "PT Naik BB",
      spesialisasi: "naik_bb",
      tempatGym: "Gym B",
    });

    // PT 3: turun_bb TAPI tempat_gym NULL
    const [pt3UserInsert] = await db.insert(users).values({
      email: `pt3_${Date.now()}@test.com`,
      username: `pt3_${Date.now()}`,
      passwordHash: ptHash,
      role: "pt",
    });
    const pt3UserId = pt3UserInsert.insertId;
    await db.insert(ptProfiles).values({
      userId: pt3UserId,
      nama: "PT Tanpa Gym",
      spesialisasi: "turun_bb",
    });

    // 3. PT Tokens
    const pt1Token = jwt.sign({ sub: pt1UserId, role: "pt" }, env.JWT_SECRET, { expiresIn: "1d" });
    const pt1Auth = { "Authorization": `Bearer ${pt1Token}`, "Content-Type": "application/json" };

    const pt2Token = jwt.sign({ sub: pt2UserId, role: "pt" }, env.JWT_SECRET, { expiresIn: "1d" });
    const pt2Auth = { "Authorization": `Bearer ${pt2Token}`, "Content-Type": "application/json" };

    // 4. Klien lengkapi profil & cycle aktif
    // Update profile (usia, gender, tinggi)
    await fetch(`${baseUrl}/klien/profile`, {
      method: "PUT", headers: klienAuth,
      body: JSON.stringify({ usia: 25, jenisKelamin: "pria", tinggiBadanCm: 170 })
    });
    // Create progress cycle turun_bb
    await fetch(`${baseUrl}/klien/progress-cycles`, {
      method: "POST", headers: klienAuth,
      body: JSON.stringify({ bbAwalKg: 80, bbTujuanKg: 70, tujuan: "turun_bb", durasiHari: 30 })
    });

    // === TEST 1: GET /pt/recommendations ===
    console.log("\n=== TEST 1: GET /pt/recommendations ===");
    
    // a. Sebelum punya cycle (buat klien dummy baru sementara)
    const noCycleKlienToken = jwt.sign({ sub: pt3UserId /* wait, must be klien role, let's just make one */, role: "klien" }, env.JWT_SECRET);
    // Well, actually, making a new klien is easy
    const [k2User] = await db.insert(users).values({ email: `k2_${Date.now()}@test.com`, username: `k2_${Date.now()}`, passwordHash: ptHash, role: "klien" });
    await db.insert(klienProfiles).values({ userId: k2User.insertId, nama: "K2" });
    const k2Auth = { "Authorization": `Bearer ${jwt.sign({ sub: k2User.insertId, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" })}`, "Content-Type": "application/json" };
    
    const res1a = await fetch(`${baseUrl}/pt/recommendations`, { headers: k2Auth });
    console.log(`1a. Tanpa cycle -> [${res1a.status}] ${await res1a.text()}`);

    // b. Punya cycle turun_bb
    const res1b = await fetch(`${baseUrl}/pt/recommendations`, { headers: klienAuth });
    const data1b: any = await res1b.json();
    console.log(`1b. Dengan cycle turun_bb -> [${res1b.status}] Ditemukan ${data1b.data.length} PT.`);
    const hasTurunBB = data1b.data.some((p: any) => p.spesialisasi === "turun_bb");
    const hasNaikBB = data1b.data.some((p: any) => p.spesialisasi === "naik_bb");
    console.log(`    Spesialisasi filter check: turun_bb ada? ${hasTurunBB}, naik_bb ada? ${hasNaikBB}`);
    
    // c. Pastikan PT tanpa gym TIDAK muncul
    const hasNoGym = data1b.data.some((p: any) => p.nama === "PT Tanpa Gym");
    console.log(`1c. PT tanpa gym muncul? ${hasNoGym}`);

    // === TEST 2: POST /klien/pairing-requests ===
    console.log("\n=== TEST 2: POST /klien/pairing-requests ===");
    const res2a = await fetch(`${baseUrl}/klien/pairing-requests`, {
      method: "POST", headers: klienAuth,
      body: JSON.stringify({ ptId: pt1Id })
    });
    const data2a: any = await res2a.json();
    console.log(`2a. Kirim request pertama -> [${res2a.status}] ${JSON.stringify(data2a)}`);
    const reqId = data2a.data.id;

    const res2b = await fetch(`${baseUrl}/klien/pairing-requests`, {
      method: "POST", headers: klienAuth,
      body: JSON.stringify({ ptId: pt1Id }) // or another PT, still should fail
    });
    console.log(`2b. Kirim request kedua selagi pending -> [${res2b.status}] ${await res2b.text()}`);


    // === TEST 3: GET /klien/pairing-requests/current ===
    console.log("\n=== TEST 3: GET /klien/pairing-requests/current ===");
    const res3 = await fetch(`${baseUrl}/klien/pairing-requests/current`, { headers: klienAuth });
    const data3: any = await res3.json();
    console.log(`3a. Status saat ini -> [${res3.status}] status: ${data3.data.status}, PT: ${data3.data.pt.nama}`);


    // === TEST 4: GET /pt/pairing-requests ===
    console.log("\n=== TEST 4: GET /pt/pairing-requests ===");
    const res4a = await fetch(`${baseUrl}/pt/pairing-requests`, { headers: pt1Auth });
    const data4a: any = await res4a.json();
    console.log(`4a. PT penerima request -> [${res4a.status}] Total: ${data4a.data.length}`);

    const res4b = await fetch(`${baseUrl}/pt/pairing-requests`, { headers: pt2Auth });
    const data4b: any = await res4b.json();
    console.log(`4b. PT lain (tidak menerima) -> [${res4b.status}] Total: ${data4b.data.length}`);


    // === TEST 5: PUT /pt/pairing-requests/:id - Ownership & Status ===
    console.log("\n=== TEST 5: PUT /pt/pairing-requests/:id - Ownership & Status ===");
    const res5a = await fetch(`${baseUrl}/pt/pairing-requests/${reqId}`, {
      method: "PUT", headers: pt2Auth,
      body: JSON.stringify({}) // terima
    });
    console.log(`5a. PT lain mencoba respond -> [${res5a.status}] ${await res5a.text()}`);
    console.log(`    ${res5a.status === 404 ? "PASS" : "FAIL"}: PT lain harus mendapat 404 (bukan 403) untuk menyembunyikan keberadaan data`);


    // === TEST 6: PUT /pt/pairing-requests/:id - TERIMA ===
    console.log("\n=== TEST 6: PUT /pt/pairing-requests/:id - TERIMA ===");
    const t0 = Date.now();
    const res6a = await fetch(`${baseUrl}/pt/pairing-requests/${reqId}`, {
      method: "PUT", headers: pt1Auth,
      body: JSON.stringify({}) // Terima
    });
    const t1 = Date.now();
    console.log(`6a. PT terima request -> [${res6a.status}] ${await res6a.text()}`);
    console.log(`6c. Waktu response API: ${t1 - t0} ms (Harus sangat cepat, tidak menunggu AI 5-10s)`);

    const reqDb6 = await db.query.pairingRequests.findFirst({ where: eq(pairingRequests.id, reqId) });
    const klienDb6 = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, klienUser!.id) });
    console.log(`6b. Verifikasi DB: request.status='${reqDb6?.status}', klien.ptId=${klienDb6?.ptId} (Diharapkan: 'diterima', ${pt1Id})`);

    const res5b = await fetch(`${baseUrl}/pt/pairing-requests/${reqId}`, {
      method: "PUT", headers: pt1Auth,
      body: JSON.stringify({})
    });
    console.log(`5b. PT respond request yang sama 2x -> [${res5b.status}] ${await res5b.text()}`);


    // === TEST 7: PUT /pt/pairing-requests/:id - TOLAK ===
    console.log("\n=== TEST 7: PUT /pt/pairing-requests/:id - TOLAK ===");
    // Buat klien 3 untuk test tolak (klien 1 sudah punya PT aktif)
    const [k3User] = await db.insert(users).values({ email: `k3_${Date.now()}@test.com`, username: `k3_${Date.now()}`, passwordHash: ptHash, role: "klien" });
    const [k3Prof] = await db.insert(klienProfiles).values({ userId: k3User.insertId, nama: "K3 Tolak" });
    const k3Auth = { "Authorization": `Bearer ${jwt.sign({ sub: k3User.insertId, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" })}`, "Content-Type": "application/json" };
    
    // Request ke PT 1
    const res7Req = await fetch(`${baseUrl}/klien/pairing-requests`, {
      method: "POST", headers: k3Auth,
      body: JSON.stringify({ ptId: pt1Id })
    });
    const reqId7 = (await res7Req.json() as any).data.id;

    // Tolak TANPA alasan
    const res7b = await fetch(`${baseUrl}/pt/pairing-requests/${reqId7}`, {
      method: "PUT", headers: pt1Auth,
      body: JSON.stringify({ alasanPenolakan: "" })
    });
    console.log(`7b. Tolak tanpa alasan -> [${res7b.status}] ${await res7b.text()}`);

    // Tolak DENGAN alasan
    const res7a = await fetch(`${baseUrl}/pt/pairing-requests/${reqId7}`, {
      method: "PUT", headers: pt1Auth,
      body: JSON.stringify({ alasanPenolakan: "Maaf, jadwal penuh." })
    });
    console.log(`7a. Tolak dengan alasan -> [${res7a.status}] ${await res7a.text()}`);

    const reqDb7 = await db.query.pairingRequests.findFirst({ where: eq(pairingRequests.id, reqId7) });
    const klienDb7 = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.id, k3Prof.insertId) });
    console.log(`7c. Verifikasi DB Tolak: status='${reqDb7?.status}', klien.ptId=${klienDb7?.ptId} (Diharapkan: 'ditolak', null)`);

    // Tunggu sedikit agar AI selesai (untuk ngecek weekly plans)
    console.log("\nMenunggu 6 detik untuk verifikasi AI Weekly Plan insert...");
    await new Promise(r => setTimeout(r, 6000));
    const plans = await db.query.weeklyPlans.findMany({ where: eq(weeklyPlans.klienId, klienDb6!.id), orderBy: [desc(weeklyPlans.id)] });
    console.log(`Weekly Plans Klien 1 count = ${plans.length}`);

  } catch (error) {
    console.error("Test Error:", error);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTests();
