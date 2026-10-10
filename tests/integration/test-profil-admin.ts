/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-profil-admin.ts
 *
 * Script manual (seed sendiri) untuk profil Admin. Butuh DB lokal aktif.
 * Admin di-seed dengan userId != adminProfileId agar konsisten pola project.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, adminProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9983;

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
  const token = jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" });
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function createAdmin(label: string, withProfile: boolean) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: await argon2.hash("password123"), role: "admin",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 700_000_000;
  if (withProfile) {
    await db.insert(adminProfiles).values({ id: profileId, userId, nama: `Admin ${label}` });
  }
  return { userId, profileId, auth: sign(userId, "admin") };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const admin = await createAdmin("profil", true);
    const adminNoProfile = await createAdmin("noprofil", false);
    console.log(`admin userId=${admin.userId}, adminProfileId=${admin.profileId} (harus berbeda)`);

    // user lain untuk uji duplikat
    const otherEmail = `${uniq("otheradm")}@test.com`;
    const otherUsername = uniq("otheradm");
    await db.insert(users).values({ email: otherEmail, username: otherUsername, passwordHash: "hash", role: "klien" });

    // klien & pt untuk uji 403
    const klien = await db.insert(users).values({ email: `${uniq("kadm")}@test.com`, username: uniq("kadm"), passwordHash: "hash", role: "klien" });
    const pt = await db.insert(users).values({ email: `${uniq("padm")}@test.com`, username: uniq("padm"), passwordHash: "hash", role: "pt" });

    console.log("\n=== TES GET /admin/profile ===");
    {
      const res = await fetch(`${baseUrl}/admin/profile`, { headers: admin.auth });
      const body = await res.json();
      console.log(`GET raw: [${res.status}] ${JSON.stringify(body)}`);
      check("GET 200 + struktur user/profile", res.status === 200 && body.data.user.id === admin.userId && body.data.profile.nama === "Admin profil", body);
      check("tema ada, tanpa profileComplete", typeof body.data.user.tema === "string" && !("profileComplete" in body.data), body);
    }

    console.log("\n=== TES PUT partial (nama / email / username) ===");
    {
      const r1 = await fetch(`${baseUrl}/admin/profile`, { method: "PUT", headers: admin.auth, body: JSON.stringify({ nama: "Admin Ganteng" }) });
      const b1 = await r1.json();
      const profDb = await db.query.adminProfiles.findFirst({ where: eq(adminProfiles.userId, admin.userId) });
      console.log(`PUT nama raw: [${r1.status}] ${JSON.stringify(b1)}`);
      check("PUT nama -> admin_profiles berubah", r1.status === 200 && b1.data.profile.nama === "Admin Ganteng" && profDb!.nama === "Admin Ganteng", b1);

      const newEmail = `${uniq("admbaru")}@test.com`;
      const r2 = await fetch(`${baseUrl}/admin/profile`, { method: "PUT", headers: admin.auth, body: JSON.stringify({ email: newEmail }) });
      const b2 = await r2.json();
      console.log(`PUT email raw: [${r2.status}] ${JSON.stringify(b2)}`);
      check("PUT email -> users.email berubah", r2.status === 200 && b2.data.user.email === newEmail, b2);

      const newUsername = uniq("admuser");
      const r3 = await fetch(`${baseUrl}/admin/profile`, { method: "PUT", headers: admin.auth, body: JSON.stringify({ username: newUsername }) });
      const b3 = await r3.json();
      console.log(`PUT username raw: [${r3.status}] ${JSON.stringify(b3)}`);
      check("PUT username -> users.username berubah", r3.status === 200 && b3.data.user.username === newUsername, b3);
      check("PUT tidak menyentuh field lain (nama tetap)", b3.data.profile.nama === "Admin Ganteng", b3);
    }

    console.log("\n=== TES PUT body kosong ===");
    {
      const res = await fetch(`${baseUrl}/admin/profile`, { method: "PUT", headers: admin.auth, body: JSON.stringify({}) });
      const body = await res.json();
      console.log(`PUT kosong raw: [${res.status}] ${JSON.stringify(body)}`);
      check("PUT body kosong -> 200 tanpa perubahan", res.status === 200 && body.data.profile.nama === "Admin Ganteng", body);
    }

    console.log("\n=== TES duplikat -> 409 ===");
    {
      const rEmail = await fetch(`${baseUrl}/admin/profile`, { method: "PUT", headers: admin.auth, body: JSON.stringify({ email: otherEmail }) });
      console.log(`PUT email duplikat raw: [${rEmail.status}] ${await rEmail.text()}`);
      check("email duplikat -> 409", rEmail.status === 409, rEmail.status);

      const rUser = await fetch(`${baseUrl}/admin/profile`, { method: "PUT", headers: admin.auth, body: JSON.stringify({ username: otherUsername }) });
      console.log(`PUT username duplikat raw: [${rUser.status}] ${await rUser.text()}`);
      check("username duplikat -> 409", rUser.status === 409, rUser.status);
    }

    console.log("\n=== TES PUT /admin/password ===");
    {
      const wrong = await fetch(`${baseUrl}/admin/password`, { method: "PUT", headers: admin.auth, body: JSON.stringify({ passwordSaatIni: "salah", passwordBaru: "passwordBaru123" }) });
      console.log(`password salah raw: [${wrong.status}] ${await wrong.text()}`);
      check("password lama salah -> 400", wrong.status === 400, wrong.status);

      const ok = await fetch(`${baseUrl}/admin/password`, { method: "PUT", headers: admin.auth, body: JSON.stringify({ passwordSaatIni: "password123", passwordBaru: "passwordBaru123" }) });
      console.log(`password benar raw: [${ok.status}] ${await ok.text()}`);
      check("ganti password sukses -> 200", ok.status === 200, ok.status);

      const u = await db.query.users.findFirst({ where: eq(users.id, admin.userId) });
      check("hash baru tersimpan", await argon2.verify(u!.passwordHash, "passwordBaru123"), u!.passwordHash);
    }

    console.log("\n=== TES PUT /admin/theme ===");
    {
      const res = await fetch(`${baseUrl}/admin/theme`, { method: "PUT", headers: admin.auth, body: JSON.stringify({ tema: "malam" }) });
      const body = await res.json();
      const u = await db.query.users.findFirst({ where: eq(users.id, admin.userId) });
      console.log(`theme raw: [${res.status}] ${JSON.stringify(body)}`);
      check("tema berubah -> malam", res.status === 200 && body.data.tema === "malam" && u!.tema === "malam", body);
    }

    console.log("\n=== TES auth & 404 ===");
    {
      const noAuth = await fetch(`${baseUrl}/admin/profile`);
      console.log(`tanpa token raw: [${noAuth.status}] ${await noAuth.text()}`);
      check("tanpa token -> 401", noAuth.status === 401, noAuth.status);

      const asKlien = await fetch(`${baseUrl}/admin/profile`, { headers: sign(klien[0].insertId, "klien") });
      check("token klien -> 403", asKlien.status === 403, asKlien.status);

      const asPt = await fetch(`${baseUrl}/admin/profile`, { headers: sign(pt[0].insertId, "pt") });
      check("token PT -> 403", asPt.status === 403, asPt.status);

      const noProf = await fetch(`${baseUrl}/admin/profile`, { headers: adminNoProfile.auth });
      console.log(`admin tanpa profil raw: [${noProf.status}] ${await noProf.text()}`);
      check("admin tanpa admin_profiles -> 404", noProf.status === 404, noProf.status);
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
