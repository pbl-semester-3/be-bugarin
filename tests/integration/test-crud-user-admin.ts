/**
 * CARA MENJALANKAN:
 * npx tsx tests/integration/test-crud-user-admin.ts
 *
 * Verifikasi CRUD user admin + soft-delete + koordinasi (login/authGuard/rekomendasi).
 * Butuh DB lokal aktif. Seed manual, userId != profileId.
 */
import { createApp } from "../../src/app";
import { db } from "../../src/config/db";
import {
  users,
  adminProfiles,
  klienProfiles,
  ptProfiles,
  progressCycles,
  pairingRequests,
} from "../../src/db/schema";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import * as argon2 from "argon2";

const PORT = 9982;

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
  const token = jwt.sign({ sub: userId, role }, env.JWT_SECRET, { expiresIn: "1d" });
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function createAdmin(label: string) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: await argon2.hash("password123"), role: "admin",
  });
  const userId = ins[0].insertId;
  await db.insert(adminProfiles).values({ userId, nama: `Admin ${label}` });
  return { userId, auth: sign(userId, "admin") };
}

async function createKlien(label: string, opts?: { ptId?: number; withCycle?: boolean }) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: await argon2.hash("password123"), role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({ id: profileId, userId, nama: `Klien ${label}`, ptId: opts?.ptId ?? null });
  if (opts?.withCycle) {
    await db.insert(progressCycles).values({
      klienId: profileId, bbAwalKg: 80, bbTujuanKg: 70, tujuan: "turun_bb", durasiHari: 30,
      targetKaloriPerHari: 1800, status: "aktif", tanggalMulai: "2026-09-01",
    });
  }
  return { userId, profileId, auth: sign(userId, "klien") };
}

async function createPt(label: string, opts?: { tempatGym?: string | null; spesialisasi?: "turun_bb" | "naik_bb" }) {
  const ins = await db.insert(users).values({
    email: `${uniq(label)}@test.com`, username: uniq(label), passwordHash: await argon2.hash("password123"), role: "pt",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 500_000_000;
  await db.insert(ptProfiles).values({
    id: profileId, userId, nama: `PT ${label}`, spesialisasi: opts?.spesialisasi ?? "turun_bb", tempatGym: opts?.tempatGym ?? "Gym X",
  });
  return { userId, profileId, auth: sign(userId, "pt") };
}

async function runTests() {
  const app = createApp();
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    console.log("\n=== SETUP ===");
    const admin = await createAdmin("crud");

    console.log("\n=== TES GET /admin/users ===");
    {
      const noRole = await fetch(`${baseUrl}/admin/users`, { headers: admin.auth });
      console.log(`tanpa role raw: [${noRole.status}] ${await noRole.text()}`);
      check("role wajib -> 400", noRole.status === 400, noRole.status);

      const klienA = await createKlien("listA", { withCycle: true });
      const ptA = await createPt("listA");

      const resK = await fetch(`${baseUrl}/admin/users?role=klien`, { headers: admin.auth });
      const bK = await resK.json();
      const itemK = bK.data.find((x: any) => x.id === klienA.userId);
      console.log(`role=klien raw: [${resK.status}] total=${bK.data.length}`);
      check("klien: klienProfile terisi, ptProfile null", itemK && itemK.klienProfile !== null && itemK.ptProfile === null, itemK);
      check("klien: tujuan dari siklus aktif", itemK?.klienProfile?.tujuan === "turun_bb", itemK?.klienProfile);
      check("klien: isActive true", itemK?.isActive === true, itemK);

      const resP = await fetch(`${baseUrl}/admin/users?role=pt`, { headers: admin.auth });
      const bP = await resP.json();
      const itemP = bP.data.find((x: any) => x.id === ptA.userId);
      console.log(`role=pt raw: [${resP.status}] total=${bP.data.length}`);
      check("pt: ptProfile terisi, klienProfile null", itemP && itemP.ptProfile !== null && itemP.klienProfile === null, itemP);
      check(
        "pt: trainerId PT-BGR-xxxx & createdAt ada",
        typeof itemP?.trainerId === "string" && /^PT-BGR-\d{4,}$/.test(itemP.trainerId) && typeof itemP?.createdAt === "string",
        itemP
      );
      check("pt: fotoUrl key ada (null tanpa foto)", itemP?.ptProfile && "fotoUrl" in itemP.ptProfile, itemP?.ptProfile);
    }

    console.log("\n=== TES POST /admin/users/pt ===");
    let createdPtUserId = 0;
    {
      const email = `${uniq("newpt")}@test.com`;
      const res = await fetch(`${baseUrl}/admin/users/pt`, {
        method: "POST", headers: admin.auth,
        body: JSON.stringify({
          nama: "PT Baru", email, username: uniq("newptuser"), password: "password123",
          usia: 30, jenisKelamin: "pria", whatsapp: "+6281234567890",
          tempatGym: "Gym Baru", spesialisasi: "turun_bb",
        }),
      });
      const body = await res.json();
      console.log(`create pt raw: [${res.status}] ${JSON.stringify(body)}`);
      check("create PT -> 201 + ptProfile", res.status === 201 && body.data.role === "pt" && body.data.ptProfile.nama === "PT Baru", body);
      createdPtUserId = body.data.id;

      const p = await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.userId, createdPtUserId) });
      check("pt_profiles dibuat", p?.nama === "PT Baru", p?.nama);
      check(
        "pt_profiles field lengkap tersimpan",
        p?.usia === 30 && p?.jenisKelamin === "pria" && p?.whatsapp === "+6281234567890" && p?.tempatGym === "Gym Baru" && p?.spesialisasi === "turun_bb",
        p
      );

      const login = await fetch(`${baseUrl}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername: email, password: "password123" }),
      });
      check("password yang diketik admin bisa login", login.status === 200, login.status);

      const dup = await fetch(`${baseUrl}/admin/users/pt`, {
        method: "POST", headers: admin.auth,
        body: JSON.stringify({ nama: "PT Dup", email, username: uniq("dupuser"), password: "password123" }),
      });
      console.log(`create duplikat raw: [${dup.status}] ${await dup.text()}`);
      check("email duplikat -> 409", dup.status === 409, dup.status);
    }

    console.log("\n=== TES PUT /admin/users/:id ===");
    {
      const k = await createKlien("editA");
      const newEmail = `${uniq("edit")}@test.com`;
      const newUsername = uniq("edituser");
      const res = await fetch(`${baseUrl}/admin/users/${k.userId}`, {
        method: "PUT", headers: admin.auth,
        body: JSON.stringify({ nama: "Nama Diubah", email: newEmail, username: newUsername, password: "passwordBaru1" }),
      });
      const body = await res.json();
      console.log(`edit klien raw: [${res.status}] ${JSON.stringify(body)}`);
      check("edit -> 200 + nama & email/username berubah", res.status === 200 && body.data.klienProfile.nama === "Nama Diubah" && body.data.email === newEmail && body.data.username === newUsername, body);

      const u = await db.query.users.findFirst({ where: eq(users.id, k.userId) });
      check("password baru ter-hash & valid", await argon2.verify(u!.passwordHash, "passwordBaru1"), u!.passwordHash);

      const dup = await fetch(`${baseUrl}/admin/users/${k.userId}`, {
        method: "PUT", headers: admin.auth, body: JSON.stringify({ email: newEmail, username: newUsername }),
      });
      check("edit tidak konflik dgn dirinya sendiri -> 200", dup.status === 200, dup.status);

      const targetAdmin = await fetch(`${baseUrl}/admin/users/${admin.userId}`, {
        method: "PUT", headers: admin.auth, body: JSON.stringify({ nama: "X" }),
      });
      console.log(`edit target admin raw: [${targetAdmin.status}] ${await targetAdmin.text()}`);
      check("target admin -> 404", targetAdmin.status === 404, targetAdmin.status);
    }

    console.log("\n=== TES PUT /admin/users/:id (field profil PT) ===");
    {
      const pt = await createPt("editpt");
      const res = await fetch(`${baseUrl}/admin/users/${pt.userId}`, {
        method: "PUT", headers: admin.auth,
        body: JSON.stringify({
          usia: 41, jenisKelamin: "wanita", whatsapp: "+628111222333",
          tempatGym: "Gym Admin", spesialisasi: "naik_bb",
        }),
      });
      const body = await res.json();
      console.log(`edit profil PT raw: [${res.status}] ${JSON.stringify(body)}`);
      check(
        "admin bisa ubah field profil PT",
        res.status === 200 && body.data.ptProfile.usia === 41 && body.data.ptProfile.jenisKelamin === "wanita" && body.data.ptProfile.whatsapp === "+628111222333" && body.data.ptProfile.tempatGym === "Gym Admin" && body.data.ptProfile.spesialisasi === "naik_bb",
        body
      );

      const p = await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.userId, pt.userId) });
      check("DB pt_profiles terupdate oleh admin", p?.tempatGym === "Gym Admin" && p?.jenisKelamin === "wanita" && p?.whatsapp === "+628111222333", p);

      // Field PT-spesifik untuk target klien diabaikan (tidak error).
      const k = await createKlien("ignorept");
      const resK = await fetch(`${baseUrl}/admin/users/${k.userId}`, {
        method: "PUT", headers: admin.auth,
        body: JSON.stringify({ nama: "Klien Ubah", tempatGym: "Gym X", jenisKelamin: "pria" }),
      });
      check("field PT untuk klien diabaikan (200)", resK.status === 200, resK.status);
    }

    console.log("\n=== TES suspend/unsuspend PT ===");
    {
      const pt = await createPt("suspendpt");

      const off = await fetch(`${baseUrl}/admin/users/${pt.userId}`, {
        method: "PUT", headers: admin.auth, body: JSON.stringify({ isActive: false }),
      });
      const offBody = await off.json();
      console.log(`suspend pt raw: [${off.status}] ${JSON.stringify(offBody)}`);
      check("suspend -> 200 isActive false", off.status === 200 && offBody.data.isActive === false, offBody);

      const u = await db.query.users.findFirst({ where: eq(users.id, pt.userId) });
      check("suspend tidak mengisi deleted_at", u!.deletedAt === null, u!.deletedAt);
      const p = await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.userId, pt.userId) });
      check("suspend tidak menghapus profil PT", p !== undefined, p);

      const list = await fetch(`${baseUrl}/admin/users?role=pt`, { headers: admin.auth });
      const lb = await list.json();
      const item = lb.data.find((x: any) => x.id === pt.userId);
      check("PT suspended tetap tampil di list (nonaktif)", item && item.isActive === false, item);

      const loginOff = await fetch(`${baseUrl}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername: u!.email, password: "password123" }),
      });
      check("login PT suspended -> 403", loginOff.status === 403, loginOff.status);

      const on = await fetch(`${baseUrl}/admin/users/${pt.userId}`, {
        method: "PUT", headers: admin.auth, body: JSON.stringify({ isActive: true }),
      });
      const onBody = await on.json();
      console.log(`unsuspend pt raw: [${on.status}] ${JSON.stringify(onBody)}`);
      check("unsuspend -> 200 isActive true", on.status === 200 && onBody.data.isActive === true, onBody);

      const loginOn = await fetch(`${baseUrl}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername: u!.email, password: "password123" }),
      });
      check("login PT aktif kembali -> 200", loginOn.status === 200, loginOn.status);
    }

    console.log("\n=== TES DELETE PT (soft) + koordinasi ===");
    {
      const pt = await createPt("delpt");
      const klienOfPt = await createKlien("delptklien", { ptId: pt.profileId });
      await db.insert(pairingRequests).values({ klienId: klienOfPt.profileId, ptId: pt.profileId, status: "pending" });

      // token lama PT (dipakai untuk uji authGuard setelah nonaktif)
      const oldPtAuth = pt.auth;

      const res = await fetch(`${baseUrl}/admin/users/${pt.userId}`, { method: "DELETE", headers: admin.auth });
      const body = await res.json();
      console.log(`delete pt raw: [${res.status}] ${JSON.stringify(body)}`);
      check("delete PT -> isActive false", res.status === 200 && body.data.isActive === false, body);

      const u = await db.query.users.findFirst({ where: eq(users.id, pt.userId) });
      check("DB PT is_active false", u!.isActive === false, u!.isActive);
      check("DB PT deleted_at terisi", u!.deletedAt !== null, u!.deletedAt);

      const listAfter = await fetch(`${baseUrl}/admin/users?role=pt`, { headers: admin.auth });
      const lbAfter = await listAfter.json();
      check("PT terhapus tidak tampil di list", !lbAfter.data.some((x: any) => x.id === pt.userId), lbAfter.data.length);

      const delAgain = await fetch(`${baseUrl}/admin/users/${pt.userId}`, { method: "DELETE", headers: admin.auth });
      check("hapus ulang PT terhapus -> 404", delAgain.status === 404, delAgain.status);

      const editDeleted = await fetch(`${baseUrl}/admin/users/${pt.userId}`, {
        method: "PUT", headers: admin.auth, body: JSON.stringify({ nama: "X" }),
      });
      check("edit PT terhapus -> 404", editDeleted.status === 404, editDeleted.status);

      const kAfter = await db.query.klienProfiles.findFirst({ where: eq(klienProfiles.id, klienOfPt.profileId) });
      check("klien PT dilepas (pt_id null)", kAfter!.ptId === null, kAfter!.ptId);

      const pending = await db.query.pairingRequests.findFirst({ where: and(eq(pairingRequests.ptId, pt.profileId), eq(pairingRequests.status, "pending")) });
      check("pending pairing PT dihapus", pending === undefined, pending);

      // login nonaktif -> 403
      const login = await fetch(`${baseUrl}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername: u!.email, password: "password123" }),
      });
      console.log(`login nonaktif raw: [${login.status}] ${await login.text()}`);
      check("login PT nonaktif -> 403", login.status === 403, login.status);

      // token lama ditolak authGuard (opsi b)
      const oldToken = await fetch(`${baseUrl}/pt/profile`, { headers: oldPtAuth });
      console.log(`token lama nonaktif raw: [${oldToken.status}] ${await oldToken.text()}`);
      check("token lama user nonaktif -> 403", oldToken.status === 403, oldToken.status);
    }

    console.log("\n=== TES DELETE klien (soft, data tetap) ===");
    {
      const k = await createKlien("delklien", { withCycle: true });
      const res = await fetch(`${baseUrl}/admin/users/${k.userId}`, { method: "DELETE", headers: admin.auth });
      const body = await res.json();
      console.log(`delete klien raw: [${res.status}] ${JSON.stringify(body)}`);
      check("delete klien -> isActive false", res.status === 200 && body.data.isActive === false, body);

      const u = await db.query.users.findFirst({ where: eq(users.id, k.userId) });
      check("DB klien is_active false", u!.isActive === false, u!.isActive);
      check("DB klien deleted_at terisi", u!.deletedAt !== null, u!.deletedAt);

      const listAfter = await fetch(`${baseUrl}/admin/users?role=klien`, { headers: admin.auth });
      const lbAfter = await listAfter.json();
      check("klien terhapus tidak tampil di list", !lbAfter.data.some((x: any) => x.id === k.userId), lbAfter.data.length);

      const cycles = await db.query.progressCycles.findMany({ where: eq(progressCycles.klienId, k.profileId) });
      check("data progres klien TETAP ada (soft-delete)", cycles.length === 1, cycles.length);
    }

    console.log("\n=== TES rekomendasi exclude PT nonaktif ===");
    {
      const klien = await createKlien("rekom", { withCycle: true });
      const ptActive = await createPt("rekomaktif", { tempatGym: "Gym Aktif" });
      const ptInactive = await createPt("rekommati", { tempatGym: "Gym Mati" });
      await fetch(`${baseUrl}/admin/users/${ptInactive.userId}`, { method: "DELETE", headers: admin.auth });

      const res = await fetch(`${baseUrl}/pt/recommendations`, { headers: klien.auth });
      const body = await res.json();
      const ids = body.data.map((p: any) => p.id);
      console.log(`rekomendasi raw: [${res.status}] total=${ids.length}`);
      check("PT aktif muncul", ids.includes(ptActive.profileId), ids);
      check("PT nonaktif TIDAK muncul", !ids.includes(ptInactive.profileId), ids);
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
