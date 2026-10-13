/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-klien-detail-pt.ts
 *
 * Script manual (seed sendiri) untuk fitur Klien Detail PT. Butuh DB lokal aktif.
 * Semua user di-seed dengan userId != profileId agar bug ownership tidak tersembunyi.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles, klienProfiles, progressCycles, weightLogs, weeklyPlans } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";
import { getStartOfWeekUtc } from "../../src/utils/week";

const PORT = 9990;

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

async function createPt(label: string, tempatGym: string | null) {
  const hash = await argon2.hash("password123");
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: hash, role: "pt",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 500_000_000;
  await db.insert(ptProfiles).values({
    id: profileId, userId, nama: `PT ${label}`, spesialisasi: "turun_bb", tempatGym,
  });
  if (userId === profileId) throw new Error("userId harus berbeda dari ptProfileId");
  const token = jwt.sign({ sub: userId, role: "pt" }, env.JWT_SECRET, { expiresIn: "1d" });
  return { userId, profileId, auth: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

async function createKlien(label: string, ptId: number | null) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({ id: profileId, userId, nama: `Klien ${label}`, ptId });
  if (userId === profileId) throw new Error("userId harus berbeda dari klienProfileId");
  return { userId, profileId };
}

async function seedPlan(klienId: number, status: "pending_review" | "disetujui" | "override") {
  const ins = await db.insert(weeklyPlans).values({
    klienId,
    mingguMulai: getStartOfWeekUtc(),
    workoutPlan: [{ hari: "Senin", jam: "16:00", jenis: "Upper Body", lokasi: "seed" }],
    mealPlan: [{ waktu: "Pagi", menu: "Oatmeal", estimasiKalori: 300 }],
    status,
  });
  return ins[0].insertId;
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;
  const today = new Date().toISOString().slice(0, 10);

  try {
    console.log("\n=== SETUP ===");
    const pt1 = await createPt("detail1", "Gym PT1");
    const pt2 = await createPt("detail2", "Gym PT2");
    const ptNull = await createPt("detailnull", null);

    const klienA = await createKlien("A", pt1.profileId);
    const klienB = await createKlien("B", pt2.profileId);
    const klienC = await createKlien("C", pt1.profileId);
    const klienD = await createKlien("D", ptNull.profileId);

    await db.insert(progressCycles).values({
      klienId: klienA.profileId, bbAwalKg: 80, bbTujuanKg: 70, tujuan: "turun_bb",
      durasiHari: 30, targetKaloriPerHari: 1800, status: "aktif", tanggalMulai: shiftUtcDate(today, -5),
    });
    await db.insert(weightLogs).values({ klienId: klienA.profileId, beratBadanKg: 79, tanggal: shiftUtcDate(today, -2) });
    await db.insert(weightLogs).values({ klienId: klienA.profileId, beratBadanKg: 78.5, tanggal: shiftUtcDate(today, -1) });
    await db.insert(weightLogs).values({ klienId: klienA.profileId, beratBadanKg: 78, tanggal: today });

    const planA = await seedPlan(klienA.profileId, "pending_review");
    const planB = await seedPlan(klienB.profileId, "pending_review");
    const planD = await seedPlan(klienD.profileId, "pending_review");

    console.log(`PT1 userId=${pt1.userId}/profileId=${pt1.profileId}; KlienA userId=${klienA.userId}/profileId=${klienA.profileId}`);

    console.log("\n=== TES GET /pt/klien ===");
    {
      const res = await fetch(`${baseUrl}/pt/klien`, { headers: pt1.auth });
      const body = await res.json();
      console.log(`list raw: [${res.status}] ${JSON.stringify(body)}`);
      const ids = body.data.map((k: any) => k.id);
      check("list hanya klien PT1 (A & C)", res.status === 200 && ids.includes(klienA.profileId) && ids.includes(klienC.profileId) && !ids.includes(klienB.profileId), body);
      check("list meta.total = 2", body.meta?.total === 2, body);
      check("list field id/nama/tujuan/durasiHari", Object.keys(body.data[0]).sort().join(",") === "durasiHari,id,nama,tujuan", body.data[0]);
      const itemA = body.data.find((k: any) => k.id === klienA.profileId);
      const itemC = body.data.find((k: any) => k.id === klienC.profileId);
      check("list tujuan+durasiHari dari siklus aktif (A)", itemA?.tujuan === "turun_bb" && itemA?.durasiHari === 30, itemA);
      check("list tanpa siklus -> null (C)", itemC?.tujuan === null && itemC?.durasiHari === null, itemC);
      check("list urut nama ASC (A sebelum C)", ids.indexOf(klienA.profileId) < ids.indexOf(klienC.profileId), ids);
    }

    console.log("\n=== TES GET /pt/klien/:id ===");
    {
      const res = await fetch(`${baseUrl}/pt/klien/${klienA.profileId}`, { headers: pt1.auth });
      const body = await res.json();
      console.log(`detail A raw: [${res.status}] ${JSON.stringify(body)}`);
      check("detail A profil + bb dari cycle", res.status === 200 && body.data.profil.bbAwalKg === 80 && body.data.profil.bbTujuanKg === 70 && body.data.profil.tujuan === "turun_bb" && body.data.profil.durasiHari === 30, body);
      check("detail A ada jenisKelamin (null krn belum diisi)", "jenisKelamin" in body.data.profil && body.data.profil.jenisKelamin === null, body);
      check("detail A grafikBb urut ASC", body.data.grafikBb.length === 3 && body.data.grafikBb[0].beratKg === 79 && body.data.grafikBb[2].beratKg === 78, body.data.grafikBb);
    }
    {
      const res = await fetch(`${baseUrl}/pt/klien/${klienC.profileId}`, { headers: pt1.auth });
      const body = await res.json();
      console.log(`detail C raw: [${res.status}] ${JSON.stringify(body)}`);
      check("detail C tanpa cycle -> bb null", body.data.profil.bbAwalKg === null && body.data.profil.bbTujuanKg === null && body.data.profil.tujuan === null, body);
      check("detail C grafikBb []", Array.isArray(body.data.grafikBb) && body.data.grafikBb.length === 0, body);
    }
    {
      const res = await fetch(`${baseUrl}/pt/klien/${klienB.profileId}`, { headers: pt1.auth });
      console.log(`detail B (milik PT lain) raw: [${res.status}] ${await res.text()}`);
      check("detail klien PT lain -> 404", res.status === 404, res.status);
    }

    console.log("\n=== TES GET /pt/klien/:id/weekly-plan ===");
    {
      const res = await fetch(`${baseUrl}/pt/klien/${klienA.profileId}/weekly-plan`, { headers: pt1.auth });
      const body = await res.json();
      console.log(`plan A raw: [${res.status}] ${JSON.stringify(body)}`);
      check("plan pending_review tetap dikembalikan", res.status === 200 && body.data.id === planA && body.data.status === "pending_review", body);
    }
    {
      const res = await fetch(`${baseUrl}/pt/klien/${klienC.profileId}/weekly-plan`, { headers: pt1.auth });
      const body = await res.json();
      console.log(`plan C raw: [${res.status}] ${JSON.stringify(body)}`);
      check("plan C tak ada -> null", res.status === 200 && body.data === null, body);
    }
    {
      const res = await fetch(`${baseUrl}/pt/klien/${klienB.profileId}/weekly-plan`, { headers: pt1.auth });
      console.log(`plan B (PT lain) raw: [${res.status}] ${await res.text()}`);
      check("plan klien PT lain -> 404", res.status === 404, res.status);
    }

    console.log("\n=== TES PUT /pt/weekly-plan/:id/approve ===");
    {
      const res = await fetch(`${baseUrl}/pt/weekly-plan/${planA}/approve`, { method: "PUT", headers: pt1.auth });
      const body = await res.json();
      console.log(`approve raw: [${res.status}] ${JSON.stringify(body)}`);
      const dbPlan = await db.query.weeklyPlans.findFirst({ where: eq(weeklyPlans.id, planA) });
      check("approve pending -> disetujui", res.status === 200 && body.data.status === "disetujui" && dbPlan!.status === "disetujui", body);
      check("approve mengisi reviewedAt", dbPlan!.reviewedAt !== null, dbPlan!.reviewedAt);

      const again = await fetch(`${baseUrl}/pt/weekly-plan/${planA}/approve`, { method: "PUT", headers: pt1.auth });
      console.log(`approve ulang raw: [${again.status}] ${await again.text()}`);
      check("approve ulang -> 400", again.status === 400, again.status);

      const other = await fetch(`${baseUrl}/pt/weekly-plan/${planB}/approve`, { method: "PUT", headers: pt1.auth });
      console.log(`approve plan PT lain raw: [${other.status}] ${await other.text()}`);
      check("approve plan PT lain -> 404", other.status === 404, other.status);
    }

    console.log("\n=== TES PUT /pt/weekly-plan/:id/override ===");
    {
      const payload = {
        workoutPlan: [{ hari: "Rabu", jam: "17:00", jenis: "Leg Day" }],
        mealPlan: [{ waktu: "Siang", menu: "Nasi Ayam", estimasiKalori: 600 }],
      };
      const res = await fetch(`${baseUrl}/pt/weekly-plan/${planA}/override`, {
        method: "PUT", headers: pt1.auth, body: JSON.stringify(payload),
      });
      const body = await res.json();
      console.log(`override raw: [${res.status}] ${JSON.stringify(body)}`);
      const dbPlan = await db.query.weeklyPlans.findFirst({ where: eq(weeklyPlans.id, planA) });
      check("override plan disetujui -> sukses + status override", res.status === 200 && body.data.status === "override" && dbPlan!.status === "override", body);
      check("override replace JSON + inject lokasi tempatGym", dbPlan!.workoutPlan[0].jenis === "Leg Day" && dbPlan!.workoutPlan[0].lokasi === "Gym PT1" && dbPlan!.mealPlan[0].menu === "Nasi Ayam", dbPlan!.workoutPlan);
    }
    {
      const payload = {
        workoutPlan: [{ hari: "Rabu", jam: "17:00", jenis: "Leg Day", lokasi: "Gym Sendiri" }],
        mealPlan: [{ waktu: "Siang", menu: "Nasi Ayam", estimasiKalori: 600 }],
      };
      const res = await fetch(`${baseUrl}/pt/weekly-plan/${planA}/override`, {
        method: "PUT", headers: pt1.auth, body: JSON.stringify(payload),
      });
      console.log(`override kirim lokasi raw: [${res.status}] ${await res.text()}`);
      check("PT kirim lokasi -> 400 (strict)", res.status === 400, res.status);
    }
    {
      const res = await fetch(`${baseUrl}/pt/weekly-plan/${planA}/override`, {
        method: "PUT", headers: pt1.auth, body: JSON.stringify({ workoutPlan: [], mealPlan: [] }),
      });
      console.log(`override invalid raw: [${res.status}] ${await res.text()}`);
      check("payload invalid (array kosong) -> 400", res.status === 400, res.status);
    }
    {
      const payload = {
        workoutPlan: [{ hari: "Kamis", jam: "18:00", jenis: "Cardio" }],
        mealPlan: [{ waktu: "Malam", menu: "Salad", estimasiKalori: 250 }],
      };
      const res = await fetch(`${baseUrl}/pt/weekly-plan/${planD}/override`, {
        method: "PUT", headers: ptNull.auth, body: JSON.stringify(payload),
      });
      const body = await res.json();
      console.log(`override tanpa tempatGym raw: [${res.status}] ${JSON.stringify(body)}`);
      check("tempatGym null -> lokasi '-'", res.status === 200 && body.data.workoutPlan[0].lokasi === "-", body);
    }
    {
      const res = await fetch(`${baseUrl}/pt/weekly-plan/99999999/approve`, { method: "PUT", headers: pt1.auth });
      console.log(`approve plan tidak ada raw: [${res.status}] ${await res.text()}`);
      check("approve plan tidak ada -> 404", res.status === 404, res.status);
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
