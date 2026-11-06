/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-request-id.ts
 *
 * Verifikasi request ID:
 *  - header `x-request-id` ada di semua respons
 *  - ID kiriman klien yang valid di-echo; yang tidak valid diganti UUID
 *  - body error memuat `requestId` yang sama dengan header
 *  - log hanya untuk status >= 400 (bukan semua request)
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";

const PORT = 9979;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  try {
    console.log("\n=== TES header x-request-id (generate) ===");
    {
      const res = await fetch(`${baseUrl}/health`);
      const id = res.headers.get("x-request-id");
      check("GET /health 200", res.status === 200);
      check("header x-request-id ada & berformat UUID", typeof id === "string" && UUID_RE.test(id ?? ""), id);
    }

    console.log("\n=== TES ID kiriman klien di-echo ===");
    {
      const res = await fetch(`${baseUrl}/health`, { headers: { "x-request-id": "trace-abc123" } });
      check("ID valid di-echo", res.headers.get("x-request-id") === "trace-abc123", res.headers.get("x-request-id"));
    }

    console.log("\n=== TES ID tidak valid diganti UUID ===");
    {
      const res = await fetch(`${baseUrl}/health`, { headers: { "x-request-id": "bad id!!" } });
      const id = res.headers.get("x-request-id");
      check("ID tidak valid diganti UUID", typeof id === "string" && UUID_RE.test(id ?? ""), id);
      check("bukan nilai kiriman", id !== "bad id!!", id);
    }

    console.log("\n=== TES body error memuat requestId (Zod 400) ===");
    {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({}),
      });
      const id = res.headers.get("x-request-id");
      const body = await res.json();
      check("400 dari Zod", res.status === 400, body);
      check("body.requestId == header", body.requestId === id, { body, id });
    }

    console.log("\n=== TES body error memuat requestId (AppError 401) ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`);
      const id = res.headers.get("x-request-id");
      const body = await res.json();
      check("401 dari authGuard", res.status === 401, body);
      check("body.requestId == header", body.requestId === id, { body, id });
    }

    console.log("\n=== TES log hanya status >= 400 ===");
    {
      const logs: string[] = [];
      const orig = console.warn;
      console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); orig(...args); };
      try {
        await fetch(`${baseUrl}/health`); // 200 -> tidak di-log
        await fetch(`${baseUrl}/pt/profile`); // 401 -> di-log
        await new Promise((resolve) => setTimeout(resolve, 50));
      } finally {
        console.warn = orig;
      }
      check("request 200 tidak di-log", !logs.some((line) => line.includes("/health")), logs);
      check("request 401 di-log dengan ID", logs.some((line) => line.includes("/pt/profile") && line.includes("401")), logs);
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
