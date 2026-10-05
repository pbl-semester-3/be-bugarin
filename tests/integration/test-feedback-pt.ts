/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-feedback-pt.ts
 *
 * Script manual (seed sendiri) untuk POST /pt/klien/:id/feedbacks. Butuh DB lokal aktif.
 * Semua user di-seed dengan userId != profileId agar bug ownership tidak tersembunyi.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles, klienProfiles, feedbacks } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9988;

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

function sign(userId: number, role: "pt" | "klien") {
  const token = jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" });
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function createPt(label: string, withProfile: boolean) {
  const hash = await argon2.hash("password123");
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: hash, role: "pt",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 500_000_000;
  if (withProfile) {
    await db.insert(ptProfiles).values({ id: profileId, userId, nama: `PT ${label}`, spesialisasi: "turun_bb", tempatGym: "Gym FB" });
  }
  if (userId === profileId) throw new Error("userId harus berbeda dari ptProfileId");
  return { userId, profileId, auth: sign(userId, "pt") };
}

async function createKlien(label: string, ptId: number) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({ id: profileId, userId, nama: `Klien ${label}`, ptId });
  if (userId === profileId) throw new Error("userId harus berbeda dari klienProfileId");
  return { userId, profileId, auth: sign(userId, "klien") };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const pt1 = await createPt("fb1", true);
    const pt2 = await createPt("fb2", true);
    const ptNoProfile = await createPt("fbno", false);
    const A = await createKlien("A", pt1.profileId);
    const B = await createKlien("B", pt2.profileId);
    console.log(`PT1 userId=${pt1.userId}/profileId=${pt1.profileId}; KlienA userId=${A.userId}/profileId=${A.profileId}`);

    const post = (klienId: number | string, auth: Record<string, string>, body: unknown) =>
      fetch(`${baseUrl}/pt/klien/${klienId}/feedbacks`, { method: "POST", headers: auth, body: JSON.stringify(body) });

    console.log("\n=== TES POST valid ===");
    let createdId = 0;
    {
      const res = await post(A.profileId, pt1.auth, { pesan: "Semangat terus ya latihannya!" });
      const body = await res.json();
      console.log(`valid raw: [${res.status}] ${JSON.stringify(body)}`);
      check("POST valid -> 201", res.status === 201, res.status);
      check("shape sesuai + source pt + dibaca false + balasan null", body.data.source === "pt" && body.data.dibaca === false && body.data.balasanKlien === null, body);
      check("ptId = pt_profiles.id (bukan userId)", body.data.ptId === pt1.profileId && body.data.ptId !== pt1.userId, body);
      check("klienId benar", body.data.klienId === A.profileId, body);
      check("createdAt ISO ada", typeof body.data.createdAt === "string", body);
      createdId = body.data.id;

      const row = await db.query.feedbacks.findFirst({ where: eq(feedbacks.id, createdId) });
      check("DB row benar", row!.source === "pt" && row!.ptId === pt1.profileId && row!.dibaca === false && row!.balasanKlien === null, row);
    }

    console.log("\n=== TES trim pesan ===");
    {
      const res = await post(A.profileId, pt1.auth, { pesan: "   halo dunia   " });
      const body = await res.json();
      console.log(`trim raw: [${res.status}] ${JSON.stringify(body)}`);
      check("pesan tersimpan ter-trim", res.status === 201 && body.data.pesan === "halo dunia", body);
    }

    console.log("\n=== TES ownership & not found ===");
    {
      const other = await post(B.profileId, pt1.auth, { pesan: "Mencoba tembus" });
      console.log(`klien PT lain raw: [${other.status}] ${await other.text()}`);
      check("klien milik PT lain -> 404", other.status === 404, other.status);

      const notFound = await post(99999999, pt1.auth, { pesan: "Klien tidak ada" });
      console.log(`klien tidak ada raw: [${notFound.status}] ${await notFound.text()}`);
      check("klien tidak ada -> 404", notFound.status === 404, notFound.status);

      const noProfile = await post(A.profileId, ptNoProfile.auth, { pesan: "Tanpa profil PT" });
      console.log(`PT tanpa profil raw: [${noProfile.status}] ${await noProfile.text()}`);
      check("PT tanpa profil -> 404", noProfile.status === 404, noProfile.status);
    }

    console.log("\n=== TES validasi ===");
    {
      const short = await post(A.profileId, pt1.auth, { pesan: "abc" });
      console.log(`pesan < 5 raw: [${short.status}] ${await short.text()}`);
      check("pesan < 5 char -> 400", short.status === 400, short.status);

      const empty = await post(A.profileId, pt1.auth, { pesan: "" });
      console.log(`pesan kosong raw: [${empty.status}] ${await empty.text()}`);
      check("pesan kosong -> 400", empty.status === 400, empty.status);

      const badId = await post("abc", pt1.auth, { pesan: "Pesan valid" });
      console.log(`id non-numerik raw: [${badId.status}] ${await badId.text()}`);
      check("id non-numerik -> 400", badId.status === 400, badId.status);
    }

    console.log("\n=== TES integrasi silang (sisi klien) ===");
    {
      const listRes = await fetch(`${baseUrl}/klien/feedbacks`, { headers: A.auth });
      const list = await listRes.json();
      console.log(`GET /klien/feedbacks raw: [${listRes.status}] ${JSON.stringify(list)}`);
      check("feedback PT muncul di GET /klien/feedbacks", listRes.status === 200 && list.data.some((f: any) => f.id === createdId && f.source === "pt"), list);

      const dashRes = await fetch(`${baseUrl}/klien/dashboard-summary`, { headers: A.auth });
      const dash = await dashRes.json();
      console.log(`dashboard A raw: [${dashRes.status}] ${JSON.stringify(dash)}`);
      check("unreadFeedbackCount naik jadi 2", dashRes.status === 200 && dash.data.unreadFeedbackCount === 2, dash);
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
