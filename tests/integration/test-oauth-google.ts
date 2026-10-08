/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-oauth-google.ts
 *
 * Verifikasi POST /auth/oauth/google. Verifikasi Google di-mock (googleAuth.verifyIdToken)
 * agar tidak butuh ID token asli. Butuh DB lokal aktif.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, klienProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { AppError } from "../../src/middlewares/error-handler";
import { googleAuth, type GooglePayload } from "../../src/modules/auth/google";

const PORT = 9984;

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

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  const originalIsConfigured = googleAuth.isConfigured;
  const originalVerify = googleAuth.verifyIdToken;

  try {
    const post = (body: unknown) =>
      fetch(`${baseUrl}/auth/oauth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    console.log("\n=== TES 503 (belum dikonfigurasi) ===");
    {
      googleAuth.isConfigured = () => false;
      const res = await post({ idToken: "whatever" });
      console.log(`not configured raw: [${res.status}] ${await res.text()}`);
      check("GOOGLE_CLIENT_ID kosong -> 503", res.status === 503, res.status);
      googleAuth.isConfigured = () => true;
    }

    console.log("\n=== TES validasi body ===");
    {
      const res = await post({});
      console.log(`tanpa idToken raw: [${res.status}] ${await res.text()}`);
      check("tanpa idToken -> 400", res.status === 400, res.status);
    }

    console.log("\n=== TES token invalid / belum terverifikasi ===");
    {
      googleAuth.verifyIdToken = async () => {
        throw new AppError(401, "Token Google tidak valid");
      };
      const res = await post({ idToken: "invalid" });
      console.log(`token invalid raw: [${res.status}] ${await res.text()}`);
      check("token invalid -> 401", res.status === 401, res.status);

      googleAuth.verifyIdToken = async (): Promise<GooglePayload> => ({
        sub: "g-unverified", email: `${uniq("unv")}@test.com`, emailVerified: false,
      });
      const res2 = await post({ idToken: "unverified" });
      console.log(`email belum verified raw: [${res2.status}] ${await res2.text()}`);
      check("email_verified false -> 401", res2.status === 401, res2.status);
    }

    console.log("\n=== TES happy path: klien baru ===");
    const newEmail = `${uniq("googlenew")}@test.com`;
    {
      googleAuth.verifyIdToken = async (): Promise<GooglePayload> => ({
        sub: "g-new-sub", email: newEmail, emailVerified: true, name: "Google New",
      });
      const res = await post({ idToken: "ok" });
      const body = await res.json();
      console.log(`klien baru raw: [${res.status}] ${JSON.stringify(body)}`);
      check("klien baru -> 200 { token, role: klien }", res.status === 200 && body.data.role === "klien" && typeof body.data.token === "string", body);

      const rows = await db.query.users.findMany({ where: eq(users.email, newEmail) });
      check("user dibuat tepat 1", rows.length === 1, rows.length);
      const u = rows[0];
      check("google_id tersimpan", u.googleId === "g-new-sub", u.googleId);
      check("password_hash bukan plaintext/hex acak di-hash", u.passwordHash.startsWith("$argon2"), u.passwordHash);

      const prof = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, u.id) });
      check("klien_profiles dibuat dgn nama dari Google", prof?.nama === "Google New", prof?.nama);

      // token valid untuk akses endpoint klien
      const me = await fetch(`${baseUrl}/klien/profile`, { headers: { Authorization: `Bearer ${body.data.token}` } });
      check("token OAuth bisa akses endpoint klien", me.status === 200, me.status);
    }

    console.log("\n=== TES login ulang (idempotent) ===");
    {
      const res = await post({ idToken: "ok" });
      const body = await res.json();
      const rows = await db.query.users.findMany({ where: eq(users.email, newEmail) });
      console.log(`login ulang raw: [${res.status}] ${JSON.stringify(body)}`);
      check("login ulang -> 200 & tidak duplikat", res.status === 200 && rows.length === 1, { status: res.status, rows: rows.length });
    }

    console.log("\n=== TES link akun klien existing (email terdaftar) ===");
    const linkEmail = `${uniq("googlelink")}@test.com`;
    {
      const reg = await fetch(`${baseUrl}/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: "Link User", email: linkEmail, username: uniq("linkuser"), password: "password123" }),
      });
      check("register klien existing sukses", reg.status === 201, reg.status);

      googleAuth.verifyIdToken = async (): Promise<GooglePayload> => ({
        sub: "g-link-sub", email: linkEmail, emailVerified: true, name: "Link User",
      });
      const res = await post({ idToken: "ok" });
      console.log(`link raw: [${res.status}] ${await res.text()}`);
      const rows = await db.query.users.findMany({ where: eq(users.email, linkEmail) });
      check("email existing -> ter-link google_id, tidak duplikat", res.status === 200 && rows.length === 1 && rows[0].googleId === "g-link-sub", rows.map((r) => r.googleId));
    }

    console.log("\n=== TES email milik PT -> 403 ===");
    const ptEmail = `${uniq("googlept")}@test.com`;
    {
      await db.insert(users).values({ email: ptEmail, username: uniq("gpt"), passwordHash: "hash", role: "pt" });
      googleAuth.verifyIdToken = async (): Promise<GooglePayload> => ({
        sub: "g-pt-sub", email: ptEmail, emailVerified: true, name: "PT",
      });
      const res = await post({ idToken: "ok" });
      console.log(`email PT raw: [${res.status}] ${await res.text()}`);
      check("email milik PT -> 403", res.status === 403, res.status);
    }

    console.log("\n=== TES email terhubung google_id lain -> 409 ===");
    const conflictEmail = `${uniq("googleconflict")}@test.com`;
    {
      await db.insert(users).values({ email: conflictEmail, username: uniq("gcf"), passwordHash: "hash", role: "klien", googleId: "g-old-sub" });
      googleAuth.verifyIdToken = async (): Promise<GooglePayload> => ({
        sub: "g-different-sub", email: conflictEmail, emailVerified: true, name: "Conflict",
      });
      const res = await post({ idToken: "ok" });
      console.log(`konflik google_id raw: [${res.status}] ${await res.text()}`);
      check("email terhubung google_id lain -> 409", res.status === 409, res.status);
    }

    console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed} ===`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error("Fatal Test error:", error);
    process.exitCode = 1;
  } finally {
    googleAuth.isConfigured = originalIsConfigured;
    googleAuth.verifyIdToken = originalVerify;
    server.close();
    await db.$client.end();
  }
}

runTests();
