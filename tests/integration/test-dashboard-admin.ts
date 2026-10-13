/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-dashboard-admin.ts
 *
 * Verifikasi GET /admin/dashboard-summary (hanya user aktif). Butuh DB lokal aktif.
 * Pakai pendekatan baseline+delta agar tahan terhadap data yang sudah ada di DB.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, adminProfiles, klienProfiles, ptProfiles, pairingRequests } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9981;

let counter = 0;
function uniq(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
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

function sign(userId: number, role: "admin" | "klien" | "pt") {
  return { Authorization: `Bearer ${jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" })}` };
}

async function createAdmin(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: await argon2.hash("password123"), role: "admin",
  });
  await db.insert(adminProfiles).values({ userId: ins[0].insertId, nama: `Admin ${label}` });
  return { userId: ins[0].insertId, auth: sign(ins[0].insertId, "admin") };
}

async function createKlien(label: string, opts?: { isActive?: boolean; ptId?: number }) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien", isActive: opts?.isActive ?? true,
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({ id: profileId, userId, nama: `Klien ${label}`, ptId: opts?.ptId ?? null });
  return { userId, profileId };
}

async function createPt(label: string, isActive: boolean) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "pt", isActive,
  });
  const userId = ins[0].insertId;
  const profileId = userId + 500_000_000;
  await db.insert(ptProfiles).values({ id: profileId, userId, nama: `PT ${label}`, spesialisasi: "turun_bb", tempatGym: "Gym D" });
  return { userId, profileId };
}

async function getSummary(baseUrl: string, auth: Record<string, string>) {
  const res = await fetch(`${baseUrl}/admin/dashboard-summary`, { headers: auth });
  const body = await res.json();
  return { status: res.status, body };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const admin = await createAdmin("dash");

    console.log("\n=== TES auth ===");
    {
      const noAuth = await fetch(`${baseUrl}/admin/dashboard-summary`);
      check("tanpa token -> 401", noAuth.status === 401, noAuth.status);

      const k = await createKlien("dashklien");
      const asKlien = await fetch(`${baseUrl}/admin/dashboard-summary`, { headers: sign(k.userId, "klien") });
      check("token klien -> 403", asKlien.status === 403, asKlien.status);
    }

    console.log("\n=== TES baseline & delta ===");
    {
      const before = await getSummary(baseUrl, admin.auth);
      console.log(`baseline raw: [${before.status}] ${JSON.stringify(before.body)}`);
      check("baseline 200 + semua angka number", before.status === 200 && [before.body.data.totalKlien, before.body.data.totalPt, before.body.data.totalPairingAktif, before.body.data.totalRequestPending].every((n) => typeof n === "number"), before.body);

      const ptActive = await createPt("dashptaktif", true);
      await createPt("dashptmati", false); // nonaktif -> tidak dihitung
      const klienPaired = await createKlien("dashpaired", { isActive: true, ptId: ptActive.profileId });
      await createKlien("dashlone", { isActive: true });
      await createKlien("dashinactive", { isActive: false }); // nonaktif -> tidak dihitung
      await db.insert(pairingRequests).values({ klienId: klienPaired.profileId, ptId: ptActive.profileId, status: "pending" });

      const after = await getSummary(baseUrl, admin.auth);
      console.log(`after raw: [${after.status}] ${JSON.stringify(after.body)}`);

      check("totalKlien +2 (2 klien aktif; klien nonaktif tidak dihitung)", after.body.data.totalKlien - before.body.data.totalKlien === 2, { before: before.body.data, after: after.body.data });
      check("totalPt +1 (hanya PT aktif; PT nonaktif tidak dihitung)", after.body.data.totalPt - before.body.data.totalPt === 1, { before: before.body.data, after: after.body.data });
      check("totalPairingAktif +1", after.body.data.totalPairingAktif - before.body.data.totalPairingAktif === 1, { before: before.body.data, after: after.body.data });
      check("totalRequestPending +1", after.body.data.totalRequestPending - before.body.data.totalRequestPending === 1, { before: before.body.data, after: after.body.data });
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
