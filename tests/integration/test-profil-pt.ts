/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-profil-pt.ts
 *
 * Script manual (seed sendiri) untuk endpoint profil PT. Butuh database lokal aktif.
 * PT di-seed dengan userId != ptProfileId agar bug ownership tidak tersembunyi.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9991;

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

async function createPt(label: string, withProfile: boolean) {
  const hash = await argon2.hash("password123");
  const userInsert = await db.insert(users).values({
    email: `${uniq(label)}@test.com`,
    username: uniq(label),
    passwordHash: hash,
    role: "pt",
  });
  const userId = userInsert[0].insertId;
  const profileId = userId + 500_000_000;

  if (withProfile) {
    await db.insert(ptProfiles).values({
      id: profileId,
      userId,
      nama: `PT ${label}`,
    });
  }

  if (userId === profileId) throw new Error("userId harus berbeda dari ptProfileId");
  const token = jwt.sign({ sub: userId, role: "pt" }, env.JWT_SECRET, { expiresIn: "1d" });
  return { userId, profileId, auth: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const pt = await createPt("profil", true);
    const ptNoProfile = await createPt("noprofil", false);
    console.log(`PT userId=${pt.userId}, ptProfileId=${pt.profileId} (harus berbeda)`);

    console.log("\n=== TES GET /pt/profile ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`, { headers: pt.auth });
      const body = await res.json();
      console.log(`GET raw: [${res.status}] ${JSON.stringify(body)}`);
      check("GET profil 200 + struktur user/profile", res.status === 200 && body.data.user.id === pt.userId && body.data.profile.nama === "PT profil", body);
      check("GET profil field nullable tampil null", body.data.profile.usia === null && body.data.profile.spesialisasi === null && body.data.profile.tempatGym === null && body.data.profile.whatsapp === null, body);
      check("GET profil user.email ada", typeof body.data.user.email === "string", body);
    }

    console.log("\n=== TES PUT /pt/profile partial ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`, {
        method: "PUT", headers: pt.auth,
        body: JSON.stringify({ nama: "PT profil baru", usia: 30, whatsapp: "+6281234567890" }),
      });
      const body = await res.json();
      console.log(`PUT partial raw: [${res.status}] ${JSON.stringify(body)}`);
      check("PUT partial ubah nama/usia/whatsapp", res.status === 200 && body.data.profile.nama === "PT profil baru" && body.data.profile.usia === 30 && body.data.profile.whatsapp === "+6281234567890", body);
      check("PUT partial tidak menyentuh field terkunci", body.data.profile.tempatGym === null && body.data.profile.spesialisasi === null, body);

      const userDb = await db.query.users.findFirst({ where: eq(users.id, pt.userId) });
      check("PUT profile tidak mengubah users", userDb!.email === body.data.user.email, { email: userDb!.email });
    }

    console.log("\n=== TES PUT /pt/profile body kosong ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`, { method: "PUT", headers: pt.auth, body: JSON.stringify({}) });
      const body = await res.json();
      console.log(`PUT kosong raw: [${res.status}] ${JSON.stringify(body)}`);
      check("PUT body kosong 200 tanpa perubahan", res.status === 200 && body.data.profile.nama === "PT profil baru", body);
    }

    console.log("\n=== TES PUT /pt/profile field terlarang (.strict) ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`, {
        method: "PUT", headers: pt.auth,
        body: JSON.stringify({ nama: "Coba", email: "hacker@x.com", username: "hacker" }),
      });
      const body = await res.json();
      console.log(`PUT terlarang raw: [${res.status}] ${JSON.stringify(body)}`);
      check("kirim email/username -> 400", res.status === 400, body);

      const userDb = await db.query.users.findFirst({ where: eq(users.id, pt.userId) });
      check("email/username users tidak berubah", userDb!.email !== "hacker@x.com" && userDb!.username !== "hacker", userDb);
    }

    console.log("\n=== TES PUT /pt/profile field terkunci (read-only) ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`, {
        method: "PUT", headers: pt.auth,
        body: JSON.stringify({ jenisKelamin: "pria", tempatGym: "Gym Baru", spesialisasi: "turun_bb" }),
      });
      const body = await res.json();
      console.log(`PUT field terkunci raw: [${res.status}] ${JSON.stringify(body)}`);
      check("kirim jenisKelamin/tempatGym/spesialisasi -> 400", res.status === 400, body);

      const p = await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.userId, pt.userId) });
      check("field terkunci tidak berubah", p!.jenisKelamin === null && p!.tempatGym === null && p!.spesialisasi === null, p);
    }

    console.log("\n=== TES PUT /pt/password ===");
    {
      const wrong = await fetch(`${baseUrl}/pt/password`, {
        method: "PUT", headers: pt.auth,
        body: JSON.stringify({ passwordSaatIni: "salah", passwordBaru: "passwordBaru123" }),
      });
      console.log(`password salah raw: [${wrong.status}] ${await wrong.text()}`);
      check("passwordSaatIni salah -> 400", wrong.status === 400, wrong.status);

      const ok = await fetch(`${baseUrl}/pt/password`, {
        method: "PUT", headers: pt.auth,
        body: JSON.stringify({ passwordSaatIni: "password123", passwordBaru: "passwordBaru123" }),
      });
      console.log(`password benar raw: [${ok.status}] ${await ok.text()}`);
      check("ganti password sukses -> 200", ok.status === 200, ok.status);

      const userDb = await db.query.users.findFirst({ where: eq(users.id, pt.userId) });
      const matchesNew = await argon2.verify(userDb!.passwordHash, "passwordBaru123");
      check("hash password baru tersimpan", matchesNew, matchesNew);
    }

    console.log("\n=== TES PUT /pt/theme ===");
    {
      const res = await fetch(`${baseUrl}/pt/theme`, {
        method: "PUT", headers: pt.auth,
        body: JSON.stringify({ tema: "malam" }),
      });
      const body = await res.json();
      console.log(`theme raw: [${res.status}] ${JSON.stringify(body)}`);
      const userDb = await db.query.users.findFirst({ where: eq(users.id, pt.userId) });
      check("tema berubah jadi malam", res.status === 200 && body.data.tema === "malam" && userDb!.tema === "malam", body);
    }

    console.log("\n=== TES tanpa profil PT ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`, { headers: ptNoProfile.auth });
      console.log(`tanpa profil raw: [${res.status}] ${await res.text()}`);
      check("PT tanpa profil -> 404", res.status === 404, res.status);
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
