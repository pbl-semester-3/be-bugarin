/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-lupa-sandi.ts
 *
 * Verifikasi endpoint Lupa Kata Sandi (klien):
 *  - POST /auth/forgot-password : anti-enumeration (email tak ada tetap 200), kode di-log (dev).
 *  - POST /auth/reset-password  : verifikasi kode 6 digit, set sandi baru, sekali pakai.
 *  - Rate limit ketat per-IP.
 *
 * Catatan: butuh DB aktif (sesuai DATABASE_URL di .env). Membuat 1 user uji lalu menghapusnya.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, klienProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";

const PORT = 9978;

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

const email = `lupasandi_${Date.now()}@test.com`;
const passwordAwal = "password123";
const passwordBaru = "passwordBaru456";

async function createKlien(): Promise<number> {
  const username = `lupasandi_${Date.now()}`;
  const ins = await db.insert(users).values({
    email, username, passwordHash: await argon2.hash(passwordAwal), role: "klien",
  });
  const userId = ins[0].insertId;
  await db.insert(klienProfiles).values({ userId, nama: "Klien Lupa Sandi" });
  return userId;
}

// Tangkap kode dari log mailer (fallback dev) selama satu pemanggilan.
async function captureResetCode<T>(fn: () => Promise<T>): Promise<{ result: T; code: string | null }> {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); orig(...a); };
  try {
    const result = await fn();
    const line = logs.find((l) => l.includes("[RESET] Kode untuk"));
    const match = line?.match(/Kode untuk .*?: (\d{6})/);
    return { result, code: match ? match[1] : null };
  } finally {
    console.log = orig;
  }
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;
  let userId: number | null = null;

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
      body: JSON.stringify(body),
    });

  try {
    userId = await createKlien();

    console.log("\n=== TES forgot-password (email terdaftar) ===");
    let kode: string | null = null;
    {
      const { result: res, code } = await captureResetCode(() => post("/auth/forgot-password", { email }));
      const body = await res.json();
      kode = code;
      check("forgot-password -> 200 { data: ok }", res.status === 200 && body.data === "ok", body);
      check("kode 6 digit ter-log (fallback dev)", typeof code === "string" && /^\d{6}$/.test(code ?? ""), code);
    }

    console.log("\n=== TES forgot-password (email TIDAK terdaftar) — anti-enumeration ===");
    {
      const { result: res, code } = await captureResetCode(() => post("/auth/forgot-password", { email: "tidak-ada@test.com" }));
      const body = await res.json();
      check("email tak terdaftar tetap 200 { data: ok }", res.status === 200 && body.data === "ok", body);
      check("tidak ada kode ter-log untuk email tak terdaftar", code === null, code);
    }

    console.log("\n=== TES reset-password (kode SALAH) ===");
    {
      const res = await post("/auth/reset-password", { email, kode: "000000", passwordBaru });
      const body = await res.json();
      check("kode salah -> 400 pesan generik", res.status === 400 && body.error === "Kode verifikasi salah atau kedaluwarsa", body);
    }

    console.log("\n=== TES reset-password (kode BENAR) ===");
    {
      const res = await post("/auth/reset-password", { email, kode, passwordBaru });
      const body = await res.json();
      check("reset dengan kode benar -> 200", res.status === 200 && body.data === "ok", body);
    }

    console.log("\n=== TES login pakai sandi baru ===");
    {
      const res = await post("/auth/login", { emailOrUsername: email, password: passwordBaru });
      const body = await res.json();
      check("login sandi baru -> 200 + token", res.status === 200 && typeof body.data?.token === "string", body);

      const resLama = await post("/auth/login", { emailOrUsername: email, password: passwordAwal });
      check("login sandi lama -> 401", resLama.status === 401);
    }

    console.log("\n=== TES kode sekali pakai ===");
    {
      const res = await post("/auth/reset-password", { email, kode, passwordBaru: "passwordLain789" });
      const body = await res.json();
      check("pakai ulang kode yang sama -> 400", res.status === 400 && body.error === "Kode verifikasi salah atau kedaluwarsa", body);
    }

    console.log("\n=== TES validasi Zod (kode bukan 6 digit) ===");
    {
      const res = await post("/auth/reset-password", { email, kode: "12", passwordBaru });
      const body = await res.json();
      check("kode invalid -> 400 { error.fields }", res.status === 400 && body.error?.fields?.kode !== undefined, body);
    }

    console.log("\n=== TES rate limit ketat (5 / 15 menit per IP) ===");
    {
      let saw429 = false;
      for (let i = 0; i < 8; i += 1) {
        const res = await post("/auth/forgot-password", { email: "rate@test.com" });
        if (res.status === 429) { saw429 = true; break; }
      }
      check("percobaan beruntun -> 429", saw429);
    }

    console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed} ===`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error("Fatal Test error:", error);
    process.exitCode = 1;
  } finally {
    server.close();
    if (userId !== null) {
      // Hapus user uji (password_reset_tokens cascade; klien_profiles harus manual dulu).
      await db.delete(klienProfiles).where(eq(klienProfiles.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
      console.log(`Cleanup: user uji id ${userId} dihapus.`);
    }
    await db.$client.end();
  }
}

runTests();
