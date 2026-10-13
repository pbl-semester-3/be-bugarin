/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-foto-profil-pt.ts
 *
 * Verifikasi fitur foto profil PT (Cloudinary). Butuh DB lokal aktif.
 * Happy-path upload hanya dijalankan bila CLOUDINARY_URL di-set.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, ptProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";

const PORT = 9978;

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let counter = 0;
function uniq(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}

let passed = 0;
let failed = 0;
let unproven = 0;
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

function sign(userId: number, role: "pt" | "klien") {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" });
}

async function createPt(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "pt",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 500_000_000;
  await db.insert(ptProfiles).values({ id: profileId, userId, nama: `PT ${label}` });
  return { userId, profileId, token: sign(userId, "pt") };
}

async function createKlien(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien",
  });
  return { userId: ins[0].insertId, token: sign(ins[0].insertId, "klien") };
}

function uploadForm(file?: { buf: Buffer; type: string; name: string }) {
  const form = new FormData();
  if (file) form.append("foto", new Blob([file.buf], { type: file.type }), file.name);
  return form;
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const pt = await createPt("foto");
    const klien = await createKlien("fotok");
    const ptAuth = { Authorization: `Bearer ${pt.token}` };
    const cloudinaryReady = Boolean(process.env.CLOUDINARY_URL);
    console.log(`CLOUDINARY_URL terdeteksi: ${cloudinaryReady}`);

    console.log("\n=== TES auth & validasi ===");
    {
      const noAuth = await fetch(`${baseUrl}/pt/profile/photo`, { method: "POST", body: uploadForm() });
      check("tanpa token -> 401", noAuth.status === 401, noAuth.status);

      const wrongRole = await fetch(`${baseUrl}/pt/profile/photo`, {
        method: "POST", headers: { Authorization: `Bearer ${klien.token}` }, body: uploadForm({ buf: PNG_1x1, type: "image/png", name: "a.png" }),
      });
      check("role klien -> 403", wrongRole.status === 403, wrongRole.status);

      const noFile = await fetch(`${baseUrl}/pt/profile/photo`, { method: "POST", headers: ptAuth, body: uploadForm() });
      check("tanpa file -> 400", noFile.status === 400, noFile.status);

      const badType = await fetch(`${baseUrl}/pt/profile/photo`, {
        method: "POST", headers: ptAuth, body: uploadForm({ buf: Buffer.from("hello"), type: "text/plain", name: "a.txt" }),
      });
      check("tipe bukan gambar -> 400", badType.status === 400, badType.status);

      const tooBig = await fetch(`${baseUrl}/pt/profile/photo`, {
        method: "POST", headers: ptAuth, body: uploadForm({ buf: Buffer.alloc(2 * 1024 * 1024 + 1), type: "image/png", name: "big.png" }),
      });
      check(">2MB -> 400", tooBig.status === 400, tooBig.status);
    }

    console.log("\n=== TES awal: profile.fotoUrl null ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile`, { headers: ptAuth });
      const body = await res.json();
      console.log(`profile awal raw: [${res.status}] ${JSON.stringify(body.data?.profile)}`);
      check("profile.fotoUrl null sebelum upload", body.data.profile.fotoUrl === null, body.data.profile);
    }

    console.log("\n=== TES DELETE saat belum ada foto ===");
    {
      const res = await fetch(`${baseUrl}/pt/profile/photo`, { method: "DELETE", headers: ptAuth });
      check("delete tanpa foto -> 404", res.status === 404, res.status);
    }

    console.log("\n=== TES happy path (Cloudinary) ===");
    if (!cloudinaryReady) {
      console.log("BELUM TERBUKTI (CLOUDINARY_URL belum di-set): upload/get/replace/delete tidak dijalankan.");
      unproven += 1;
    } else {
      const up1 = await fetch(`${baseUrl}/pt/profile/photo`, {
        method: "POST", headers: ptAuth, body: uploadForm({ buf: PNG_1x1, type: "image/png", name: "foto1.png" }),
      });
      const b1 = await up1.json();
      console.log(`upload 1 raw: [${up1.status}] ${JSON.stringify(b1)}`);
      check("upload valid -> 200 + fotoUrl CDN", up1.status === 200 && typeof b1.data.fotoUrl === "string" && b1.data.fotoUrl.startsWith("https://res.cloudinary.com"), b1);

      const prof = await fetch(`${baseUrl}/pt/profile`, { headers: ptAuth });
      const profBody = await prof.json();
      check("fotoUrl muncul di GET /pt/profile (profile.fotoUrl)", profBody.data.profile.fotoUrl === b1.data.fotoUrl, profBody.data.profile);

      const row = await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.userId, pt.userId) });
      check("DB menyimpan public_id (bukan URL absolut)", typeof row!.fotoPublicId === "string" && !row!.fotoPublicId.startsWith("http"), row!.fotoPublicId);

      const up2 = await fetch(`${baseUrl}/pt/profile/photo`, {
        method: "POST", headers: ptAuth, body: uploadForm({ buf: PNG_1x1, type: "image/png", name: "foto2.png" }),
      });
      const b2 = await up2.json();
      check("upload ulang (replace) -> fotoUrl baru", up2.status === 200 && b2.data.fotoUrl !== b1.data.fotoUrl, b2);

      const del = await fetch(`${baseUrl}/pt/profile/photo`, { method: "DELETE", headers: ptAuth });
      const bd = await del.json();
      check("delete -> fotoUrl null", del.status === 200 && bd.data.fotoUrl === null, bd);

      const rowAfter = await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.userId, pt.userId) });
      check("DB foto_public_id null setelah delete", rowAfter!.fotoPublicId === null, rowAfter!.fotoPublicId);
    }

    console.log(`\n=== KESIMPULAN: Lulus ${passed}, Gagal ${failed}, Belum Terbukti ${unproven} ===`);
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
