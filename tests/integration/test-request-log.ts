/**
 * CARA MENJALANKAN (jalankan migrasi dulu: npm run db:migrate):
 * npx tsx tests/integration/test-request-log.ts
 *
 * Verifikasi pencatatan error ke tabel request_logs:
 *  - error 400 (Zod) & 401 (AppError) tercatat
 *  - requestId/method/endpoint/status/message/duration sesuai
 *  - role null untuk request tanpa auth
 *  - baris uji dibersihkan di akhir
 */
import { eq } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { requestLogs } from "../../src/db/schema";

const PORT = 9980;

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

async function run() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;
  const createdIds: string[] = [];

  try {
    console.log("\n=== TES error 400 (Zod) tercatat ===");
    {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({}),
      });
      const id = res.headers.get("x-request-id") ?? "";
      createdIds.push(id);
      check("400", res.status === 400);

      const rows = await db.select().from(requestLogs).where(eq(requestLogs.requestId, id));
      const row = rows[0];
      check("baris tercatat", rows.length === 1, rows);
      check("status=400", row?.status === 400, row);
      check("method=POST", row?.method === "POST", row);
      check("endpoint=/auth/login", row?.endpoint === "/auth/login", row);
      check("message=Validasi gagal", row?.message === "Validasi gagal", row);
      check("role=null (belum auth)", row?.role === null, row);
      check("durationMs >= 0", (row?.durationMs ?? -1) >= 0, row);
    }

    console.log("\n=== TES error 401 (AppError) tercatat ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`);
      const id = res.headers.get("x-request-id") ?? "";
      createdIds.push(id);
      check("401", res.status === 401);

      const rows = await db.select().from(requestLogs).where(eq(requestLogs.requestId, id));
      check("baris 401 tercatat", rows.length === 1 && rows[0].status === 401, rows);
      check("endpoint=/pt/profile", rows[0]?.endpoint === "/pt/profile", rows[0]);
    }

    console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed} ===`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error("Fatal Test error:", error);
    process.exitCode = 1;
  } finally {
    server.close();
    for (const id of createdIds) {
      if (id) await db.delete(requestLogs).where(eq(requestLogs.requestId, id));
    }
    await db.$client.end();
  }
}

run();
