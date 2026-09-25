import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, klienProfiles, progressCycles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9998;

async function runTest() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("=== 1. SETUP DATA ===");
    
    // Klien
    const [kUser] = await db.insert(users).values({ 
      email: `km_${Date.now()}@test.com`, 
      username: `km_${Date.now()}`, 
      passwordHash: await argon2.hash("hash"), 
      role: "klien" 
    });
    const [kProf] = await db.insert(klienProfiles).values({ 
      userId: kUser.insertId, 
      nama: "Klien Meal" 
    });
    
    // Cycle (ibutuhkan untuk add meal log)
    const [cycleInsert] = await db.insert(progressCycles).values({
      klienId: kProf.insertId, bbAwalKg: 80, bbTujuanKg: 70, tujuan: "turun_bb", 
      durasiHari: 30, targetKaloriPerHari: 2000, tanggalMulai: new Date().toISOString().slice(0, 10), status: "aktif"
    });

    const klienToken = jwt.sign({ sub: kUser.insertId, role: "klien" }, env.JWT_SECRET, { expiresIn: "1d" });
    const klienAuth = { "Authorization": `Bearer ${klienToken}`, "Content-Type": "application/json" };

    console.log("\n=== 2. TRIGGER API POST /klien/meal-logs ===");
    const res = await fetch(`${baseUrl}/klien/meal-logs`, { 
      method: "POST", 
      headers: klienAuth, 
      body: JSON.stringify({
        jenisWaktu: "siang",
        namaMakanan: "Salad Buah Naga Custom 123", // Custom name to trigger AI
        porsiGram: 200
      }) 
    });
    
    const responseData = await res.json();
    console.log(`Response HTTP POST: ${res.status}`);
    console.log("Response Body:", JSON.stringify(responseData, null, 2));

  } catch (err) {
    console.error("Test Error:", err);
  } finally {
    server.close();
    process.exit(0);
  }
}

runTest();
