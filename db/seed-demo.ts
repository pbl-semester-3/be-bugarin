// db/seed-demo.ts
// Jalankan: npm run db:seed-demo
//
// Data DEMO lengkap untuk kebutuhan tampilan (dashboard Admin, Kelola Pengguna,
// Riwayat, Verifikasi, Klien, Feedback). BUKAN data produksi.
// - Idempotent: email deterministik; jika sudah ada, dilewati.
// - Env-gated: menolak jalan bila NODE_ENV=production (kecuali ALLOW_SEED_DEMO=true).
// - Password semua akun demo: "password".
// - Bersihkan dengan: npm run db:clean-demo -- --test --yes
//
// Klien historis dibuat untuk Jan..bulan berjalan (WIB). users.createdAt DAN
// siklus pertama (tanggalMulai) berada di bulan yang sama agar memenuhi aturan
// "subset ketat" grafik dashboard (registrasi + pilih target di bulan sama).

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
  adminActivityLogs,
} from "../src/db/schema";
import { eq, like } from "drizzle-orm";
import { getStartOfWeekUtc } from "../src/utils/week";
import * as argon2 from "argon2";

const PASSWORD = "password";
const DOMAIN = "bugarin.com";

type Tujuan = "turun_bb" | "naik_bb";
type PlanStatus = "pending_review" | "disetujui" | "override";

const PLAN_STATUSES: PlanStatus[] = [
  "pending_review",
  "disetujui",
  "override",
  "disetujui",
  "override",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ym(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

async function userExists(email: string): Promise<boolean> {
  const u = await db.query.users.findFirst({ where: eq(users.email, email) });
  return Boolean(u);
}

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_SEED_DEMO !== "true"
  ) {
    console.error(
      "Tolak: NODE_ENV=production. Set ALLOW_SEED_DEMO=true bila memang disengaja."
    );
    process.exit(1);
  }

  const passwordHash = await argon2.hash(PASSWORD);
  const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = nowWib.getUTCFullYear();
  const currentMonth = nowWib.getUTCMonth() + 1;
  const todayWib = nowWib.toISOString().slice(0, 10);
  const weekStart = getStartOfWeekUtc();

  // ----- PT demo (7 aktif + 1 nonaktif) -----
  const ptList: { id: number; tempatGym: string; tujuan: Tujuan }[] = [];
  for (let i = 1; i <= 8; i += 1) {
    const isActive = i <= 7;
    const email = `demo.pt.${i}@${DOMAIN}`;
    const username = `demopt${i}`;
    const tujuan: Tujuan = i % 2 === 1 ? "turun_bb" : "naik_bb";

    if (await userExists(email)) {
      // Pastikan PT existing tetap bisa dipakai untuk assignment klien.
      const u = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (u && isActive) {
        const p = await db.query.ptProfiles.findFirst({
          where: eq(ptProfiles.userId, u.id),
        });
        if (p) {
          ptList.push({
            id: p.id,
            tempatGym: p.tempatGym ?? `Gym Demo ${i}`,
            tujuan: p.spesialisasi ?? tujuan,
          });
        }
      }
      console.log(`PT ${email} sudah ada, dilewati.`);
      continue;
    }

    const ins = await db.insert(users).values({
      email,
      username,
      passwordHash,
      role: "pt",
      isActive,
      createdAt: new Date(`${year}-01-10T03:00:00.000Z`),
    });
    const userId = ins[0].insertId;
    const profileId = userId + 500_000_000;
    const tempatGym = `Gym Demo ${i}`;

    await db.insert(ptProfiles).values({
      id: profileId,
      userId,
      nama: `Coach Demo ${i}`,
      usia: 28 + i,
      jenisKelamin: i % 2 === 1 ? "pria" : "wanita",
      spesialisasi: tujuan,
      tempatGym,
      whatsapp: `+628120000${pad2(i)}`,
    });

    if (isActive) ptList.push({ id: profileId, tempatGym, tujuan });
    console.log(`PT demo dibuat: ${email}`);
  }

  if (ptList.length === 0) {
    console.warn("Tidak ada PT aktif untuk assignment klien demo.");
  }

  // ----- Klien demo per bulan (Jan s/d bulan berjalan, WIB) -----
  let totalClients = 0;
  for (let month = 1; month <= currentMonth; month += 1) {
    const key = ym(year, month);
    const count = 5 + (month % 4); // 5..8 klien/bulan
    const isCurrentMonth = month === currentMonth;

    for (let n = 1; n <= count; n += 1) {
      const email = `demo.klien.${key}.${n}@${DOMAIN}`;
      const username = `demoklien${key.replace("-", "")}${n}`;

      if (await userExists(email)) {
        continue;
      }

      const tujuan: Tujuan = n % 2 === 1 ? "turun_bb" : "naik_bb";
      const pt = ptList.length > 0 ? ptList[(month + n) % ptList.length] : null;
      const paired = pt !== null && (month + n) % 6 !== 0;

      const day = isCurrentMonth ? nowWib.getUTCDate() : 15;
      const monthDay = `${key}-${pad2(day)}`;
      const createdAt = isCurrentMonth
        ? new Date()
        : new Date(`${key}-15T03:00:00.000Z`);

      const insU = await db.insert(users).values({
        email,
        username,
        passwordHash,
        role: "klien",
        isActive: true,
        createdAt,
      });
      const userId = insU[0].insertId;
      const profileId = userId + 600_000_000;

      const bbAwal = 55 + ((month * 3 + n * 4) % 40);
      const bbTujuan = tujuan === "turun_bb" ? bbAwal - 8 : bbAwal + 8;
      const durasiHari = [60, 90, 120][n % 3];

      await db.insert(klienProfiles).values({
        id: profileId,
        userId,
        nama: `Klien Demo ${key}-${n}`,
        usia: 20 + (n % 15),
        jenisKelamin: n % 2 === 1 ? "wanita" : "pria",
        tinggiBadanCm: 155 + ((n * 3) % 25),
        alergiMakanan: n % 5 === 0 ? "Kacang" : null,
        ptId: paired && pt ? pt.id : null,
      });

      // Siklus pertama: bulan sama dengan registrasi (subset ketat dashboard).
      await db.insert(progressCycles).values({
        klienId: profileId,
        bbAwalKg: bbAwal,
        bbTujuanKg: bbTujuan,
        tujuan,
        durasiHari,
        targetKaloriPerHari: tujuan === "turun_bb" ? 1700 : 2400,
        status: "aktif",
        tanggalMulai: monthDay,
      });

      await db.insert(weightLogs).values({
        klienId: profileId,
        beratBadanKg: bbAwal,
        tanggal: monthDay,
      });
      await db.insert(weightLogs).values({
        klienId: profileId,
        beratBadanKg: Number(
          (bbAwal + (tujuan === "turun_bb" ? -1.2 : 1.2)).toFixed(1)
        ),
        tanggal: `${key}-${pad2(Math.max(1, day - 5))}`,
      });

      if (paired && pt) {
        const status = PLAN_STATUSES[(month + n) % PLAN_STATUSES.length];
        await db.insert(weeklyPlans).values({
          klienId: profileId,
          mingguMulai: weekStart,
          workoutPlan: [
            {
              hari: "Senin",
              jam: "16:00",
              jenis: "Full Body",
              lokasi: pt.tempatGym,
            },
            {
              hari: "Rabu",
              jam: "18:00",
              jenis: "Cardio",
              lokasi: pt.tempatGym,
            },
          ],
          mealPlan: [
            { waktu: "Pagi", menu: "Oatmeal", estimasiKalori: 320 },
            { waktu: "Siang", menu: "Nasi + Ayam", estimasiKalori: 520 },
          ],
          status,
        });

        await db.insert(feedbacks).values({
          klienId: profileId,
          ptId: pt.id,
          source: "pt",
          pesan: `Evaluasi demo ${key}-${n}: progres berjalan baik, pertahankan konsistensi.`,
          dibaca: n % 2 === 0,
          createdAt: isCurrentMonth
            ? new Date()
            : new Date(`${key}-20T03:00:00.000Z`),
        });
      } else if (pt) {
        await db.insert(pairingRequests).values({
          klienId: profileId,
          ptId: pt.id,
          status: "pending",
          createdAt: isCurrentMonth
            ? new Date()
            : new Date(`${key}-18T03:00:00.000Z`),
        });
      }

      totalClients += 1;
    }

    console.log(`Bulan ${key}: ${count} klien demo.`);
  }

  // ----- Beberapa klien nonaktif (uji filter status) -----
  for (let n = 1; n <= 2; n += 1) {
    const email = `demo.klien.inactive.${n}@${DOMAIN}`;
    if (await userExists(email)) continue;

    const insU = await db.insert(users).values({
      email,
      username: `demoinactive${n}`,
      passwordHash,
      role: "klien",
      isActive: false,
      createdAt: new Date(`${year}-02-10T03:00:00.000Z`),
    });
    const userId = insU[0].insertId;
    const profileId = userId + 600_000_000;
    await db.insert(klienProfiles).values({
      id: profileId,
      userId,
      nama: `Klien Nonaktif ${n}`,
      usia: 30,
      jenisKelamin: "pria",
      tinggiBadanCm: 170,
      ptId: null,
    });
    await db.insert(progressCycles).values({
      klienId: profileId,
      bbAwalKg: 70,
      bbTujuanKg: 65,
      tujuan: "turun_bb",
      durasiHari: 60,
      targetKaloriPerHari: 1700,
      status: "aktif",
      tanggalMulai: `${year}-02-10`,
    });
    console.log(`Klien nonaktif dibuat: ${email}`);
  }

  // ----- Log aktivitas admin (untuk tab Audit Riwayat) -----
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.email, adminEmail),
    });
    const hasSeedLogs = await db.query.adminActivityLogs.findFirst({
      where: like(adminActivityLogs.aksi, "Demo seed:%"),
    });
    if (adminUser && !hasSeedLogs) {
      const targets = await db.query.users.findMany({
        where: like(users.email, "demo.klien.%@bugarin.com"),
        limit: 5,
      });
      for (let i = 0; i < targets.length; i += 1) {
        const logMonth = Math.min(i + 1, currentMonth);
        await db.insert(adminActivityLogs).values({
          adminId: adminUser.id,
          aksi: `Demo seed: aktivitas admin #${i + 1}`,
          targetUserId: targets[i].id,
          createdAt: new Date(`${year}-${pad2(logMonth)}-21T03:00:00.000Z`),
        });
      }
      console.log(`Log aktivitas admin demo dibuat: ${targets.length}`);
    } else if (!adminUser) {
      console.warn("ADMIN_EMAIL tidak ditemukan di DB — log audit dilewati.");
    }
  }

  console.log("\nSeed demo selesai.");
  console.log(`Total klien demo dibuat pada run ini: ${totalClients}`);
  console.log(`Akun PT demo: demo.pt.<1..7>@bugarin.com`);
  console.log(`Akun klien demo: demo.klien.<YYYY-MM>.<n>@bugarin.com`);
  console.log(`Password semua akun demo: ${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed demo gagal:", err);
  process.exit(1);
});
