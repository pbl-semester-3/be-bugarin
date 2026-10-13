// db/seed-dev.ts
// Jalankan: npm run db:seed-dev
//
// DATA DUMMY untuk keperluan tampilan/uji (dev & staging). BUKAN data produksi.
// - Idempotent: pakai email tetap; bila sudah ada, dilewati (aman dijalankan ulang).
// - Env-gated: menolak jalan bila NODE_ENV=production (kecuali ALLOW_SEED_DEV=true).
//
// Menghapus data dummy ini: lihat catatan di akhir file (manual), atau minta script
// pembersih terpisah. Akun uji PT: dev.pt@bugarin.com / PasswordPt123.

import { db } from "../src/config/db";
import {
  users,
  klienProfiles,
  ptProfiles,
  progressCycles,
  weightLogs,
  weeklyPlans,
  pairingRequests,
  feedbacks,
} from "../src/db/schema";
import { eq } from "drizzle-orm";
import { getStartOfWeekUtc } from "../src/utils/week";
import * as argon2 from "argon2";

const PT_EMAIL = "dev.pt@bugarin.com";
const PT_USERNAME = "devpt";
const PT_PASSWORD = "PasswordPt123";
const KLien_PASSWORD = "PasswordKlien123";

function shift(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

async function userExists(email: string): Promise<boolean> {
  const u = await db.query.users.findFirst({ where: eq(users.email, email) });
  return Boolean(u);
}

async function buatKlien(
  nama: string,
  email: string,
  username: string,
  opts: { ptId: number | null; usia: number; jk: "pria" | "wanita"; tinggi: number },
) {
  const ins = await db.insert(users).values({
    email, username, passwordHash: await argon2.hash(KLien_PASSWORD), role: "klien",
  });
  const userId = ins[0].insertId;
  const profileId = userId + 600_000_000;
  await db.insert(klienProfiles).values({
    id: profileId, userId, nama, ptId: opts.ptId,
    usia: opts.usia, jenisKelamin: opts.jk, tinggiBadanCm: opts.tinggi,
  });
  return { userId, profileId };
}

async function buatCycle(klienId: number, tujuan: "turun_bb" | "naik_bb", bbAwal: number, bbTujuan: number, durasiHari: number, mulai: string) {
  await db.insert(progressCycles).values({
    klienId, bbAwalKg: bbAwal, bbTujuanKg: bbTujuan, tujuan, durasiHari,
    targetKaloriPerHari: tujuan === "turun_bb" ? 1700 : 2400, status: "aktif", tanggalMulai: mulai,
  });
}

async function buatPlan(klienId: number, status: "pending_review" | "disetujui" | "override", seed = 1) {
  await db.insert(weeklyPlans).values({
    klienId, mingguMulai: getStartOfWeekUtc(),
    workoutPlan: [
      { hari: seed % 2 === 0 ? "Selasa" : "Senin", jam: "16:00", jenis: "Full Body", lokasi: "Gym Dev" },
      { hari: seed % 2 === 0 ? "Kamis" : "Rabu", jam: "18:00", jenis: "Cardio", lokasi: "Gym Dev" },
    ],
    mealPlan: [{ waktu: "Pagi", menu: "Oatmeal", estimasiKalori: 320 }],
    status,
  });
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED_DEV !== "true") {
    console.error("Tolak: NODE_ENV=production. Set ALLOW_SEED_DEV=true bila memang disengaja.");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);

  // --- PT dev ---
  let pt = await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.nama, "Coach Dev") });
  if (!pt) {
    const existingUser = await db.query.users.findFirst({ where: eq(users.email, PT_EMAIL) });
    let ptUserId: number;
    if (existingUser) {
      ptUserId = existingUser.id;
    } else {
      const ins = await db.insert(users).values({
        email: PT_EMAIL, username: PT_USERNAME, passwordHash: await argon2.hash(PT_PASSWORD), role: "pt",
      });
      ptUserId = ins[0].insertId;
    }
    const insP = await db.insert(ptProfiles).values({
      userId: ptUserId, nama: "Coach Dev", usia: 30, jenisKelamin: "pria",
      spesialisasi: "turun_bb", tempatGym: "Gym Dev",
    });
    pt = { ...(await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.id, insP[0].insertId) }))! };
    console.log(`PT dev dibuat: ${PT_EMAIL} / ${PT_PASSWORD} (id ${pt!.id})`);
  } else {
    console.log(`PT dev sudah ada (id ${pt.id}).`);
  }

  // --- Klien ter-pairing ---
  const paired = [
    { nama: "Andi Sehat", email: "dev.klien.andi@bugarin.com", username: "devandi", usia: 28, jk: "pria" as const, tinggi: 175, tujuan: "turun_bb" as const, bbAwal: 85, bbTujuan: 75, durasi: 90, status: "disetujui" as const, logs: [85, 83, 81] },
    { nama: "Budi Kuat", email: "dev.klien.budi@bugarin.com", username: "devbudi", usia: 24, jk: "pria" as const, tinggi: 180, tujuan: "naik_bb" as const, bbAwal: 60, bbTujuan: 70, durasi: 60, status: "pending_review" as const, logs: [60, 61] },
    { nama: "Citra Raga", email: "dev.klien.citra@bugarin.com", username: "devcitra", usia: 31, jk: "wanita" as const, tinggi: 163, tujuan: "turun_bb" as const, bbAwal: 70, bbTujuan: 60, durasi: 30, status: "override" as const, logs: [] as number[] },
  ];
  let seed = 1;
  for (const k of paired) {
    if (await userExists(k.email)) {
      console.log(`Klien ${k.nama} sudah ada, dilewati.`);
      continue;
    }
    const { profileId } = await buatKlien(k.nama, k.email, k.username, { ptId: pt!.id, usia: k.usia, jk: k.jk, tinggi: k.tinggi });
    await buatCycle(profileId, k.tujuan, k.bbAwal, k.bbTujuan, k.durasi, shift(today, -20));
    for (let i = 0; i < k.logs.length; i++) {
      await db.insert(weightLogs).values({ klienId: profileId, beratBadanKg: k.logs[i], tanggal: shift(today, -(20 - i * 8)) });
    }
    await buatPlan(profileId, k.status, seed++);
    if (k.nama !== "Citra Raga") {
      await db.insert(feedbacks).values({ klienId: profileId, ptId: pt!.id, source: "pt", pesan: `Progres ${k.nama} bagus, lanjutkan.` });
    }
    console.log(`Klien ter-pairing dibuat: ${k.nama} (${k.tujuan}/${k.durasi} hari, plan ${k.status})`);
  }

  // --- Pairing request pending (halaman Verifikasi) ---
  const pending = [
    { nama: "Dewi Pemula", email: "dev.klien.dewi@bugarin.com", username: "devdewi", usia: 26, jk: "wanita" as const, tinggi: 160, tujuan: "turun_bb" as const, bbAwal: 75, bbTujuan: 65, durasi: 90 },
    { nama: "Eko Prasetyo", email: "dev.klien.eko@bugarin.com", username: "deveko", usia: 33, jk: "pria" as const, tinggi: 172, tujuan: "naik_bb" as const, bbAwal: 58, bbTujuan: 68, durasi: 60 },
  ];
  for (const p of pending) {
    if (await userExists(p.email)) {
      console.log(`Klien pending ${p.nama} sudah ada, dilewati.`);
      continue;
    }
    const { profileId } = await buatKlien(p.nama, p.email, p.username, { ptId: null, usia: p.usia, jk: p.jk, tinggi: p.tinggi });
    await buatCycle(profileId, p.tujuan, p.bbAwal, p.bbTujuan, p.durasi, shift(today, -2));
    await db.insert(pairingRequests).values({ klienId: profileId, ptId: pt!.id, status: "pending" });
    console.log(`Pairing request pending dibuat: ${p.nama} (${p.tujuan}/${p.durasi} hari)`);
  }

  console.log("\nSeed data dummy selesai.");
  console.log(`Login PT: ${PT_EMAIL} / ${PT_PASSWORD}`);
  console.log(`Login klien dummy: <email dev.klien.*> / ${KLien_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed dev gagal:", err);
  process.exit(1);
});
