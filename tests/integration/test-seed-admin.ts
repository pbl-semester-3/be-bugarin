/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-seed-admin.ts
 *
 * Verifikasi seed akun admin (env-gated & idempotent) dengan menjalankan
 * `npx tsx db/seed.ts` sebagai subprocess + cek login. Butuh DB lokal aktif.
 */
import { spawnSync } from "child_process";
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, adminProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";

const PORT = 9979;

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

function runSeed(env: Record<string, string>) {
  return spawnSync("npx tsx db/seed.ts", {
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: true,
  });
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    const email = `${uniq("adminseed")}@test.com`;
    const username = uniq("adminseed");
    const password = "AdminSeed123!";
    const nama = "Admin Seeded";
    const adminEnv = { ADMIN_EMAIL: email, ADMIN_USERNAME: username, ADMIN_PASSWORD: password, ADMIN_NAMA: nama };

    console.log("\n=== TES seed pertama ===");
    {
      const res = runSeed(adminEnv);
      console.log(`seed stdout: ${res.stdout}`);
      check("seed exit 0 + 'Seed admin dibuat'", res.status === 0 && res.stdout.includes("Seed admin dibuat"), { status: res.status, stderr: res.stderr });

      const u = await db.query.users.findFirst({ where: eq(users.email, email) });
      check("user admin dibuat (role admin, aktif, hash argon2)", u?.role === "admin" && u?.isActive === true && u?.passwordHash.startsWith("$argon2"), u);
      const p = await db.query.adminProfiles.findFirst({ where: eq(adminProfiles.userId, u!.id) });
      check("admin_profiles dibuat", p?.nama === nama, p?.nama);
    }

    console.log("\n=== TES idempotent (seed kedua) ===");
    {
      const res = runSeed(adminEnv);
      console.log(`seed2 stdout: ${res.stdout}`);
      const rows = await db.query.users.findMany({ where: eq(users.email, email) });
      check("seed kedua skip (tidak duplikat)", res.status === 0 && rows.length === 1 && res.stdout.includes("sudah ada"), { status: res.status, rows: rows.length });
    }

    console.log("\n=== TES login admin + akses profil admin ===");
    {
      const login = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({ emailOrUsername: email, password }),
      });
      const body = await login.json();
      console.log(`login raw: [${login.status}] role=${body.data?.role}`);
      check("login admin -> 200 role admin", login.status === 200 && body.data.role === "admin", body);

      const prof = await fetch(`${baseUrl}/admin/profile`, { headers: { Authorization: `Bearer ${body.data.token}` } });
      const profBody = await prof.json();
      check("GET /admin/profile -> 200", prof.status === 200 && profBody.data.profile.nama === nama, profBody);
    }

    console.log("\n=== TES env tidak lengkap -> skip ===");
    {
      const res = runSeed({ ADMIN_EMAIL: "", ADMIN_USERNAME: "", ADMIN_PASSWORD: "" });
      check("tanpa ADMIN_* -> seed admin dilewati", res.status === 0 && res.stdout.includes("Seed admin dilewati"), res.stdout);
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
