import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles, klienProfiles, pairingRequests, progressCycles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";
import { generateRealtimeFeedback } from "../../src/modules/ai/feedback";

const PORT = 9997;

async function runTest() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("=== 1. SETUP DATA ===");
    const ptHash = await argon2.hash("password123");
    
    // PT
    const [ptUserInsert] = await db.insert(users).values({ email: `ptf_${Date.now()}@test.com`, username: `ptf_${Date.now()}`, passwordHash: ptHash, role: "pt" });
    const ptUserId = ptUserInsert.insertId;
    const [ptProfInsert] = await db.insert(ptProfiles).values({ userId: ptUserId, nama: "PT Fire", spesialisasi: "turun_bb", tempatGym: "Gym Fire" });
    const ptId = ptProfInsert.insertId;

    // Klien
    const [kUser] = await db.insert(users).values({ email: `kf_${Date.now()}@test.com`, username: `kf_${Date.now()}`, passwordHash: ptHash, role: "klien" });
    const [kProf] = await db.insert(klienProfiles).values({ userId: kUser.insertId, nama: "Klien Fire" });
    
    // Cycle
    await db.insert(progressCycles).values({
      klienId: kProf.insertId, bbAwalKg: 80, bbTujuanKg: 70, tujuan: "turun_bb", durasiHari: 30, targetKaloriPerHari: 2000, tanggalMulai: "2026-09-25", status: "aktif"
    });

    // Request
    const [reqInsert] = await db.insert(pairingRequests).values({ klienId: kProf.insertId, ptId: ptId });
    const reqId = reqInsert.insertId;

    const ptToken = jwt.sign({ sub: ptUserId, role: "pt" }, env.JWT_SECRET, { expiresIn: "1d" });
    const ptAuth = { "Authorization": `Bearer ${ptToken}`, "Content-Type": "application/json" };
    
    const klienToken = jwt.sign({ sub: kUser.insertId, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
    const klienAuth = { "Authorization": `Bearer ${klienToken}`, "Content-Type": "application/json" };

    console.log("\n=== 2. TRIGGER FIRE-AND-FORGET generateWeeklyPlan ===");
    // Panggil PUT yang akan men-trigger fire and forget
    const t0 = Date.now();
    const res = await fetch(`${baseUrl}/pt/pairing-requests/${reqId}`, { method: "PUT", headers: ptAuth, body: JSON.stringify({}) });
    const t1 = Date.now();
    console.log(`Response HTTP PUT: ${res.status} (Waktu: ${t1 - t0} ms)`);
    
    console.log("\n=== 3. TRIGGER FIRE-AND-FORGET generateRealtimeFeedback ===");
    // Simulasikan fire-and-forget feedback (misal jika nanti dipakai)
    generateRealtimeFeedback("Simulasi").catch(err => {
      console.error("[FIRE-AND-FORGET FEEDBACK] Error caught:", err.message);
    });
    
    console.log("\n=== 4. MENUNGGU 6 DETIK AGAR API GEMINI SELESAI (DAN GAGAL 503) ===");
    await new Promise(r => setTimeout(r, 6000));
    
    console.log("\n=== 5. BUKTIKAN SERVER MASIH HIDUP (TIDAK CRASH KARENA UNHANDLED EXCEPTION) ===");
    const pingRes = await fetch(`${baseUrl}/pt/ping`, { headers: ptAuth });
    const pingData = await pingRes.json();
    console.log(`Ping Response: [${pingRes.status}] ${JSON.stringify(pingData)}`);
    
    if (pingRes.status === 200) {
      console.log("-> SERVER TETAP RESPONSIVE SETELAH 503 FIRE-AND-FORGET! 🎉");
    } else {
      console.log("-> SERVER ERROR / MATI!");
    }

  } catch (err) {
    console.error("Test Error:", err);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTest();
