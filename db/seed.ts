// db/seed.ts
// Jalankan: npm run db:seed
// Aman dijalankan berulang (upsert by nama) — tidak akan bikin data duplikat.

import { db } from "../src/config/db";
import { masterOlahraga } from "../src/db/schema/master-olahraga";
import { masterMakanan } from "../src/db/schema/master-makanan";

// Nilai MET (Metabolic Equivalent of Task) berikut adalah estimasi umum dari referensi
// kesehatan publik yang dikenal luas — cocok untuk kalkulasi kalori perkiraan di MVP
const olahragaSeed = [
  { nama: "Jalan Kaki", metValue: 3.5, kategori: "kardio" as const, butuhJarak: true },
  { nama: "Lari / Jogging", metValue: 8.0, kategori: "kardio" as const, butuhJarak: true },
  { nama: "Bersepeda", metValue: 6.0, kategori: "kardio" as const, butuhJarak: true },
  { nama: "Renang", metValue: 6.0, kategori: "kardio" as const, butuhJarak: true },
  { nama: "Upper Body (Angkat Beban)", metValue: 4.0, kategori: "kekuatan" as const, butuhJarak: false },
  { nama: "Lower Body (Angkat Beban)", metValue: 4.0, kategori: "kekuatan" as const, butuhJarak: false },
  { nama: "HIIT", metValue: 8.0, kategori: "kardio" as const, butuhJarak: false },
  { nama: "Yoga", metValue: 2.5, kategori: "fleksibilitas" as const, butuhJarak: false },
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

  console.log(`Selesai: ${olahragaSeed.length} olahraga, ${makananSeed.length} makanan.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed gagal:", err);
  process.exit(1);
});