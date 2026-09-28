/**
 * CARA MENJALANKAN:
 * npx ts-node --transpile-only tests/integration/test-pt-ku-edge.ts
 * 
 * CATATAN:
 * - Script ini mengatur seed datanya sendiri di database.
 * - Butuh server lokal yang sedang berjalan (npm run dev) dan database lokal (docker-compose up -d).
 * - Script ini menguji edge cases (409, 404, list filter) fitur PT-Ku.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles, klienProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9991; // Different port to avoid conflict

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

  try {
    console.log("=== SETUP DATA TEST ===");

    // 1. Klien Baru
    const klienUsername = `klien_edge_${Date.now()}`;
    const registerRes = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${klienUsername}@test.com`,
        username: klienUsername,
        password: "password123",
        role: "klien",
        nama: "Test Klien PT Ku Edge"
      })
    });
    if (registerRes.status !== 201) throw new Error("Gagal register klien");

    const klienUser = await db.query.users.findFirst({ where: eq(users.username, klienUsername) });
    const klienToken = jwt.sign({ sub: klienUser!.id, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
    const klienAuth = { "Authorization": `Bearer ${klienToken}`, "Content-Type": "application/json" };
    
    // 2. Buat PT Test
    const ptHash = await argon2.hash("password123");
    const [ptUserInsert] = await db.insert(users).values({
      email: `pt_edge_${Date.now()}@test.com`,
      username: `pt_edge_${Date.now()}`,
      passwordHash: ptHash,
      role: "pt",
    });
    const ptUserId = ptUserInsert.insertId;
    const [ptProfInsert] = await db.insert(ptProfiles).values({
      userId: ptUserId,
      nama: "PT Edge Case",
      spesialisasi: "turun_bb",
      tempatGym: "Gym Edge",
    });
    const ptId = ptProfInsert.insertId;

    // Tambahkan Progress Cycle dummy dan update PT Aktif untuk klien agar punya PT
    const d5 = new Date(); d5.setDate(d5.getDate() - 5);
    const klienProfileRec = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, klienUser!.id) });
    const { progressCycles } = await import("../../src/db/schema");
    await db.insert(progressCycles).values({
      klienId: klienProfileRec!.id,
      bbAwalKg: 80, bbTujuanKg: 75, tujuan: "turun_bb",
      durasiHari: 30, targetKaloriPerHari: 2000,
      status: "aktif",
      tanggalMulai: d5.toISOString().slice(0, 10),
      tanggalSelesai: null,
    });

    await db.update(klienProfiles)
      .set({ ptId: ptId })
      .where(eq(klienProfiles.userId, klienUser!.id));

    console.log("Setup selesai, menjalankan edge case tests...\n");

    // Skenario 1: Klien mengirim request ke PT yang sudah menjadi PT aktifnya -> 409
    const res1 = await fetch(`${baseUrl}/klien/pairing-requests`, {
      method: "POST",
      headers: klienAuth,
      body: JSON.stringify({ ptId: ptId, tujuan: "turun_bb" })
    });
    const data1 = await res1.json();
    console.log("Body 409 Kasus 1 (PT sudah aktif):", data1);
    assert(res1.status === 409, "Test 1: Request ke PT aktif -> 409", data1);

    // Skenario 2: POST /klien/pairing-requests dengan ptId yang tidak ada -> 404
    const res2 = await fetch(`${baseUrl}/klien/pairing-requests`, {
      method: "POST",
      headers: klienAuth,
      body: JSON.stringify({ ptId: 999999, tujuan: "naik_bb" })
    });
    const data2 = await res2.json();
    console.log("Body 404 Kasus 2 (ptId tidak ada):", data2);
    assert(res2.status === 404, "Test 2: Request dengan ptId tidak valid -> 404", data2);

    // Skenario 3: GET /pt/recommendations untuk klien yang sudah punya PT aktif
    const res3 = await fetch(`${baseUrl}/pt/recommendations`, {
      headers: klienAuth,
    });
    const data3 = await res3.json();
    console.log("Body GET Recommendations Kasus 3:", data3);
    
    // PT Aktif (ptId) TIDAK muncul di daftar
    const ptInList = data3.data.some((pt: any) => pt.id === ptId);
    assert(!ptInList, "Test 3: PT aktif TIDAK muncul di daftar rekomendasi", data3);

    console.log(`\nTest Selesai. Semua Edge Case Lulus!`);

  } catch (error) {
    console.error("Test error:", error);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
