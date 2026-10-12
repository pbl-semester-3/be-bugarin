/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-cookie-auth.ts
 *
 * Verifikasi konfigurasi cookie auth web (SameSite) + CORS allowlist.
 * Butuh DB lokal aktif. Default NODE_ENV=development → SameSite=Lax, secure=false.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, klienProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";
import { env } from "../../src/config/env";

const PORT = 9977;

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

async function createKlien() {
  const username = uniq("cookieklien");
  const ins = await db.insert(users).values({
    email: `${username}@test.com`, username, passwordHash: await argon2.hash("password123"), role: "klien",
  });
  const userId = ins[0].insertId;
  await db.insert(klienProfiles).values({ userId, nama: "Klien Cookie" });
  return { userId, username };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    const { username } = await createKlien();

    console.log("\n=== TES login web -> Set-Cookie ===");
    let cookieHeader = "";
    {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "web" },
        body: JSON.stringify({ emailOrUsername: username, password: "password123" }),
      });
      const setCookie = res.headers.get("set-cookie") ?? "";
      cookieHeader = setCookie.split(";")[0]; // "token=..."
      console.log(`Set-Cookie: ${setCookie}`);
      check("login web 200 + Set-Cookie token", res.status === 200 && setCookie.includes("token="), setCookie);
      check("cookie HttpOnly", /HttpOnly/i.test(setCookie), setCookie);
      check("cookie SameSite=Lax (default dev)", /SameSite=Lax/i.test(setCookie), setCookie);
      check("cookie tidak Secure di dev", !/Secure/i.test(setCookie), setCookie);
    }

    console.log("\n=== TES cookie dipakai untuk akses endpoint ===");
    {
      const res = await fetch(`${baseUrl}/klien/profile`, { headers: { Cookie: cookieHeader } });
      const body = await res.json();
      check("akses /klien/profile pakai cookie -> 200", res.status === 200 && body.data?.nama === "Klien Cookie", body);
    }

    console.log("\n=== TES login mobile -> token di body (tanpa cookie) ===");
    {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({ emailOrUsername: username, password: "password123" }),
      });
      const body = await res.json();
      check("login mobile -> token di body", res.status === 200 && typeof body.data?.token === "string", body);
      check("login mobile tanpa Set-Cookie", (res.headers.get("set-cookie") ?? "") === "", res.headers.get("set-cookie"));
    }

    console.log("\n=== TES CORS allowlist ===");
    {
      const allowed = env.webOrigins[0];
      const okRes = await fetch(`${baseUrl}/auth/login`, {
        method: "OPTIONS",
        headers: {
          Origin: allowed,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      console.log(`preflight allowed (${allowed}) -> ACAO: ${okRes.headers.get("access-control-allow-origin")}`);
      check("origin terdaftar -> ACAO sesuai", okRes.headers.get("access-control-allow-origin") === allowed, okRes.headers.get("access-control-allow-origin"));
      check("credentials true", okRes.headers.get("access-control-allow-credentials") === "true", okRes.headers.get("access-control-allow-credentials"));

      const badRes = await fetch(`${baseUrl}/auth/login`, {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example.com", "Access-Control-Request-Method": "POST" },
      });
      console.log(`preflight ditolak -> ACAO: ${badRes.headers.get("access-control-allow-origin")}`);
      check("origin tak terdaftar -> tanpa ACAO", !badRes.headers.get("access-control-allow-origin"), badRes.headers.get("access-control-allow-origin"));
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
