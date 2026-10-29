// db/seed.ts
// Jalankan: npm run db:seed
// Aman dijalankan berulang (upsert by nama) — tidak akan bikin data duplikat.

import { db } from "../src/config/db";
import { masterOlahraga } from "../src/db/schema/master-olahraga";
import { masterMakanan } from "../src/db/schema/master-makanan";
import { users, adminProfiles } from "../src/db/schema";
import { eq, or } from "drizzle-orm";
import * as argon2 from "argon2";

// Nilai MET (Metabolic Equivalent of Task) berikut adalah estimasi umum dari referensi
// kesehatan publik yang dikenal luas — cocok untuk kalkulasi kalori perkiraan di MVP
const olahragaSeed = [
  { nama: "Jalan Kaki", metValue: 3.5, kategori: "kardio" as const, butuhJarak: true, butuhBeban: false },
  { nama: "Lari / Jogging", metValue: 8.0, kategori: "kardio" as const, butuhJarak: true, butuhBeban: false },
  { nama: "Bersepeda", metValue: 6.0, kategori: "kardio" as const, butuhJarak: true, butuhBeban: false },
  { nama: "Renang", metValue: 6.0, kategori: "kardio" as const, butuhJarak: true, butuhBeban: false },
  { nama: "Upper Body (Angkat Beban)", metValue: 4.0, kategori: "kekuatan" as const, butuhJarak: false, butuhBeban: true },
  { nama: "Lower Body (Angkat Beban)", metValue: 4.0, kategori: "kekuatan" as const, butuhJarak: false, butuhBeban: true },
  { nama: "HIIT", metValue: 8.0, kategori: "kardio" as const, butuhJarak: false, butuhBeban: false },
  { nama: "Yoga", metValue: 2.5, kategori: "fleksibilitas" as const, butuhJarak: false, butuhBeban: false },
];

// Estimasi kalori per 100g — starting point, akan bertambah dinamis dari input klien
const makananSeed = [
  { nama: "Nasi", kaloriPer100g: 130, kategori: "karbohidrat" as const },
  { nama: "Ayam", kaloriPer100g: 165, kategori: "protein" as const },
  { nama: "Ikan", kaloriPer100g: 150, kategori: "protein" as const },
  { nama: "Sayur", kaloriPer100g: 35, kategori: "sayur" as const },
  { nama: "Telur", kaloriPer100g: 155, kategori: "protein" as const },
  { nama: "Tempe", kaloriPer100g: 150, kategori: "protein" as const },
  { nama: "Tahu", kaloriPer100g: 120, kategori: "protein" as const },
];

// Seed akun Admin awal (env-gated & idempotent). Admin tidak bisa self-register,
// jadi akun ini dibuat di sini agar web Admin bisa login lalu membuat akun PT.
// Catatan: TIDAK menimpa password admin yang sudah ada (skip if exists).
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const nama = process.env.ADMIN_NAMA || "Super Admin";

  if (!email || !username || !password) {
    console.log(
      "Seed admin dilewati: set ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD di .env kalau ingin membuat akun admin awal.",
    );
    return;
  }

  const existing = await db.query.users.findFirst({
    where: or(eq(users.email, email), eq(users.username, username)),
  });
  if (existing) {
    console.log(`Seed admin dilewati: user '${existing.email}' sudah ada (password tidak diubah).`);
    return;
  }

  const passwordHash = await argon2.hash(password);
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(users).values({
      email,
      username,
      passwordHash,
      role: "admin",
      isActive: true,
    });
    await tx.insert(adminProfiles).values({ userId: inserted.insertId, nama });
  });

  console.log(`Seed admin dibuat: ${email} (username: ${username}).`);
}

async function seed() {
  console.log("Seeding master_olahraga...");
  for (const item of olahragaSeed) {
    await db.insert(masterOlahraga).values(item).onDuplicateKeyUpdate({ set: item });
  }

  console.log("Seeding master_makanan...");
  for (const item of makananSeed) {
    await db
      .insert(masterMakanan)
      .values({ ...item, sumber: "seed" })
      .onDuplicateKeyUpdate({ set: { kaloriPer100g: item.kaloriPer100g, kategori: item.kategori } });
  }

  console.log("Seeding akun admin...");
  await seedAdmin();

  console.log(`Selesai: ${olahragaSeed.length} olahraga, ${makananSeed.length} makanan.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed gagal:", err);
  process.exit(1);
});