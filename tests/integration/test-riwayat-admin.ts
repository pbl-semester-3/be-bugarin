/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-riwayat-admin.ts
 *
 * Verifikasi GET /admin/riwayat (2 array terpisah + pagination). Butuh DB lokal aktif.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import {
  users,
  adminProfiles,
  klienProfiles,
  ptProfiles,
  feedbacks,
  adminActivityLogs,
} from "../../src/db/schema";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9980;

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
  return { Authorization: `Bearer ${jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" })}` };
}

async function createAdmin(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: await argon2.hash("password123"), role: "admin",
  });
  await db.insert(adminProfiles).values({ userId: ins[0].insertId, nama: `Admin ${label}` });
  return { userId: ins[0].insertId, auth: sign(ins[0].insertId, "admin") };
}

async function createKlien(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({ id: profileId, userId, nama: `Klien ${label}` });
  return { userId, profileId };
}

async function createPt(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "pt",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 500_000_000;
  await db.insert(ptProfiles).values({ id: profileId, userId, nama: `PT ${label}`, spesialisasi: "turun_bb", tempatGym: "Gym R" });
  return { userId, profileId };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const admin = await createAdmin("riwayat");
    const pt = await createPt("riwayat");
    const klien = await createKlien("riwayat");

    const pesanPt = `pesan pt ${uniq("msg")}`;
    const pesanAi = `pesan ai ${uniq("msg")}`;
    await db.insert(feedbacks).values({ klienId: klien.profileId, ptId: pt.profileId, source: "pt", pesan: pesanPt });
    await db.insert(feedbacks).values({ klienId: klien.profileId, ptId: null, source: "ai", pesan: pesanAi });

    const aksiKlien = `aksi target klien ${uniq("log")}`;
    const aksiNull = `aksi target null ${uniq("log")}`;
    await db.insert(adminActivityLogs).values({ adminId: admin.userId, aksi: aksiKlien, targetUserId: klien.userId });
    await db.insert(adminActivityLogs).values({ adminId: admin.userId, aksi: aksiNull, targetUserId: null });

    console.log("\n=== TES auth ===");
    {
      const noAuth = await fetch(`${baseUrl}/admin/riwayat`);
      check("tanpa token -> 401", noAuth.status === 401, noAuth.status);
      const asPt = await fetch(`${baseUrl}/admin/riwayat`, { headers: sign(pt.userId, "pt") });
      check("token PT -> 403", asPt.status === 403, asPt.status);
    }

    console.log("\n=== TES validasi query ===");
    {
      const over = await fetch(`${baseUrl}/admin/riwayat?limit=101`, { headers: admin.auth });
      console.log(`limit 101 raw: [${over.status}] ${await over.text()}`);
      check("limit > 100 -> 400", over.status === 400, over.status);
    }

    console.log("\n=== TES data & resolusi nama ===");
    {
      const res = await fetch(`${baseUrl}/admin/riwayat?limit=100`, { headers: admin.auth });
      const body = await res.json();
      console.log(`riwayat raw: [${res.status}] feedbackLogs=${body.data.feedbackLogs.length}, adminActivityLogs=${body.data.adminActivityLogs.length}`);

      const fb = body.data.feedbackLogs.find((f: any) => f.pesan === pesanPt);
      check("feedback PT muncul + namaPt/namaKlien ter-resolve", fb && fb.namaPt === "PT riwayat" && fb.namaKlien === "Klien riwayat", fb);
      check("feedback source=ai TIDAK muncul", !body.data.feedbackLogs.some((f: any) => f.pesan === pesanAi), null);

      const logK = body.data.adminActivityLogs.find((l: any) => l.aksi === aksiKlien);
      check("log target klien: namaAdmin + namaTargetUser ter-resolve", logK && logK.namaAdmin === "Admin riwayat" && logK.namaTargetUser === "Klien riwayat", logK);

      const logN = body.data.adminActivityLogs.find((l: any) => l.aksi === aksiNull);
      check("log target null -> namaTargetUser null eksplisit", logN && logN.namaTargetUser === null, logN);

      // ordering DESC
      const fbs = body.data.feedbackLogs;
      const ordered = fbs.every((_: any, i: number) => i === 0 || new Date(fbs[i - 1].createdAt) >= new Date(fbs[i].createdAt));
      check("feedbackLogs urut createdAt DESC", ordered, fbs.map((f: any) => f.createdAt));
    }

    console.log("\n=== TES pagination ===");
    {
      const res = await fetch(`${baseUrl}/admin/riwayat?page=1&limit=1`, { headers: admin.auth });
      const body = await res.json();
      console.log(`page1 limit1 raw: [${res.status}] ${JSON.stringify(body.meta)}`);
      check("limit=1 -> 1 item", body.data.feedbackLogs.length === 1 && body.data.adminActivityLogs.length === 1, body.data);
      check("hasMore = (1 < total)", body.meta.feedbackLogs.hasMore === (1 < body.meta.feedbackLogs.total), body.meta);

      const res2 = await fetch(`${baseUrl}/admin/riwayat?page=2&limit=1`, { headers: admin.auth });
      const body2 = await res2.json();
      check("page=2 -> item berbeda dari page=1", body2.data.feedbackLogs[0]?.id !== body.data.feedbackLogs[0]?.id, { p1: body.data.feedbackLogs[0]?.id, p2: body2.data.feedbackLogs[0]?.id });
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
