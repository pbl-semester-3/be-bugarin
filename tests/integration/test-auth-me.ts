/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-auth-me.ts
 *
 * Verifikasi GET /auth/me untuk semua role + guard (401/403).
 * Butuh database aktif (sesuai DATABASE_URL di .env).
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9993;

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

function sign(userId: number, role: "klien" | "pt" | "admin") {
  const token = jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" });
  return { Authorization: `Bearer ${token}` };
}

async function createUser(role: "klien" | "pt" | "admin", label: string) {
  const email = `${uniq(label)}@test.com`;
  const username = uniq(`${label}user`);
  const ins = await db.insert(users).values({
    email,
    username,
    passwordHash: await argon2.hash("password123"),
    role,
  });
  return { id: ins[0].insertId, email, username };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const klien = await createUser("klien", "me_klien");
    const pt = await createUser("pt", "me_pt");
    const admin = await createUser("admin", "me_admin");

    console.log("\n=== TES GET /auth/me per role ===");
    for (const [label, user] of [
      ["klien", klien],
      ["pt", pt],
      ["admin", admin],
    ] as const) {
      const res = await fetch(`${baseUrl}/auth/me`, { headers: sign(user.id, label) });
      const body = await res.json();
      console.log(`me ${label} raw: [${res.status}] ${JSON.stringify(body)}`);
      check(
        `me ${label}: 200 + data sesuai`,
        res.status === 200 &&
          body.data.id === user.id &&
          body.data.role === label &&
          body.data.email === user.email &&
          body.data.username === user.username,
        body
      );
      check(`me ${label}: tidak membocorkan passwordHash`, body.data?.passwordHash === undefined, body);
    }

    console.log("\n=== TES tanpa token / token invalid ===");
    {
      const noToken = await fetch(`${baseUrl}/auth/me`);
      check("tanpa token -> 401", noToken.status === 401, noToken.status);

      const badToken = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: "Bearer token-palsu" },
      });
      check("token invalid -> 401", badToken.status === 401, badToken.status);
    }

    console.log("\n=== TES akun nonaktif ===");
    {
      const inactive = await createUser("pt", "me_inactive");
      await db.update(users).set({ isActive: false }).where(eq(users.id, inactive.id));

      const res = await fetch(`${baseUrl}/auth/me`, { headers: sign(inactive.id, "pt") });
      console.log(`me nonaktif raw: [${res.status}] ${await res.text()}`);
      check("token user nonaktif -> 403", res.status === 403, res.status);
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
