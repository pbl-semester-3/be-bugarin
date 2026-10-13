/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-foto-profil-klien.ts
 *
 * Verifikasi fitur foto profil klien (Cloudinary). Butuh DB lokal aktif.
 * Happy-path upload hanya dijalankan bila CLOUDINARY_URL di-set; kalau tidak,
 * jalur validasi/auth/ownership tetap diuji dan happy-path ditandai "belum terbukti".
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import { users, klienProfiles } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";

const PORT = 9985;

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

function sign(userId: number, role: "klien" | "pt") {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" });
}

async function createKlien(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({ id: profileId, userId, nama: `Klien ${label}` });
  return { userId, profileId, token: sign(userId, "klien") };
}

async function createPt(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: "hash", role: "pt",
  });
  return { userId: ins[0].insertId, token: sign(ins[0].insertId, "pt") };
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
    const klien = await createKlien("foto");
    const pt = await createPt("fotopt");
    const klienAuth = { Authorization: `Bearer ${klien.token}` };
    const cloudinaryReady = Boolean(process.env.CLOUDINARY_URL);
    console.log(`CLOUDINARY_URL terdeteksi: ${cloudinaryReady}`);

    console.log("\n=== TES auth & validasi ===");
    {
      const noAuth = await fetch(`${baseUrl}/klien/profile/photo`, { method: "POST", body: uploadForm() });
      console.log(`tanpa token raw: [${noAuth.status}] ${await noAuth.text()}`);
      check("tanpa token -> 401", noAuth.status === 401, noAuth.status);

      const wrongRole = await fetch(`${baseUrl}/klien/profile/photo`, {
        method: "POST", headers: { Authorization: `Bearer ${pt.token}` }, body: uploadForm({ buf: PNG_1x1, type: "image/png", name: "a.png" }),
      });
      console.log(`role PT raw: [${wrongRole.status}] ${await wrongRole.text()}`);
      check("role PT -> 403", wrongRole.status === 403, wrongRole.status);

      const noFile = await fetch(`${baseUrl}/klien/profile/photo`, { method: "POST", headers: klienAuth, body: uploadForm() });
      console.log(`tanpa file raw: [${noFile.status}] ${await noFile.text()}`);
      check("tanpa file -> 400", noFile.status === 400, noFile.status);

      const badType = await fetch(`${baseUrl}/klien/profile/photo`, {
        method: "POST", headers: klienAuth, body: uploadForm({ buf: Buffer.from("hello"), type: "text/plain", name: "a.txt" }),
      });
      console.log(`tipe salah raw: [${badType.status}] ${await badType.text()}`);
      check("tipe bukan gambar -> 400", badType.status === 400, badType.status);

      const tooBig = await fetch(`${baseUrl}/klien/profile/photo`, {
        method: "POST", headers: klienAuth, body: uploadForm({ buf: Buffer.alloc(2 * 1024 * 1024 + 1), type: "image/png", name: "big.png" }),
      });
      console.log(`>2MB raw: [${tooBig.status}] ${await tooBig.text()}`);
      check(">2MB -> 400", tooBig.status === 400, tooBig.status);
    }

    console.log("\n=== TES awal: fotoUrl null ===");
    {
      const res = await fetch(`${baseUrl}/klien/profile`, { headers: { ...klienAuth, "Content-Type": "application/json" } });
      const body = await res.json();
      console.log(`profile awal raw: [${res.status}] ${JSON.stringify(body)}`);
      check("fotoUrl null sebelum upload", body.data.fotoUrl === null, body.data);
    }

    console.log("\n=== TES DELETE saat belum ada foto ===");
    {
      const res = await fetch(`${baseUrl}/klien/profile/photo`, { method: "DELETE", headers: klienAuth });
      console.log(`delete tanpa foto raw: [${res.status}] ${await res.text()}`);
      check("delete tanpa foto -> 404", res.status === 404, res.status);
    }

    console.log("\n=== TES happy path (Cloudinary) ===");
    if (!cloudinaryReady) {
      console.log("BELUM TERBUKTI (CLOUDINARY_URL belum di-set): upload/get/replace/delete tidak dijalankan.");
      unproven += 1;
    } else {
      const up1 = await fetch(`${baseUrl}/klien/profile/photo`, {
        method: "POST", headers: klienAuth, body: uploadForm({ buf: PNG_1x1, type: "image/png", name: "foto1.png" }),
      });
      const b1 = await up1.json();
      console.log(`upload 1 raw: [${up1.status}] ${JSON.stringify(b1)}`);
      check("upload valid -> 200 + fotoUrl CDN", up1.status === 200 && typeof b1.data.fotoUrl === "string" && b1.data.fotoUrl.startsWith("https://res.cloudinary.com"), b1);

      const prof = await fetch(`${baseUrl}/klien/profile`, { headers: { ...klienAuth, "Content-Type": "application/json" } });
      const profBody = await prof.json();
      check("fotoUrl muncul di GET /klien/profile", profBody.data.fotoUrl === b1.data.fotoUrl, profBody.data);

      const row = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, klien.userId) });
      check("DB menyimpan public_id (bukan URL absolut)", typeof row!.fotoPublicId === "string" && !row!.fotoPublicId.startsWith("http"), row!.fotoPublicId);

      const up2 = await fetch(`${baseUrl}/klien/profile/photo`, {
        method: "POST", headers: klienAuth, body: uploadForm({ buf: PNG_1x1, type: "image/png", name: "foto2.png" }),
      });
      const b2 = await up2.json();
      console.log(`upload 2 (replace) raw: [${up2.status}] ${JSON.stringify(b2)}`);
      check("upload ulang -> fotoUrl baru", up2.status === 200 && b2.data.fotoUrl !== b1.data.fotoUrl, b2);

      const del = await fetch(`${baseUrl}/klien/profile/photo`, { method: "DELETE", headers: klienAuth });
      const bd = await del.json();
      console.log(`delete raw: [${del.status}] ${JSON.stringify(bd)}`);
      check("delete -> fotoUrl null", del.status === 200 && bd.data.fotoUrl === null, bd);

      const rowAfter = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.userId, klien.userId) });
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
