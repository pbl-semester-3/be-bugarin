# PRD Fitur: Klien Detail PT

## Metadata

| | |
|---|---|
| **Role** | Personal Trainer (PT) |
| **Branch** | `feat/klien-detail-pt` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.2 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.2 (Fitur Web PT — baris "Klien": detail klien, grafik BB, review plan AI via Setuju/Override)
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.2 (kontrak endpoint GET klien, GET/PUT weekly plan)
- `docs/Bugarin_PRD_Frontend.md` bab 4.3 (spesifikasi UI Klien Detail, grafik Recharts, form override terstruktur)
- `docs/bugarin_schema_notes.md` bab 4 (Lifecycle weekly plan, kasus "cedera" untuk override)
- `docs/bugarin_erd.mermaid` — relasi `klien_profiles`, `weekly_plans`, `weight_logs`
- `fitur/pt/PRD-dashboard-pt.md` (PENTING: konsistensi definisi "klien aktif" dan resolusi "minggu berjalan")
- `fitur/klien/PRD-riwayat-klien.md` (referensi query histori untuk grafik)

## Ringkasan

Fitur ini menyediakan kemampuan fungsional bagi PT untuk mengelola secara individu klien-klien yang mereka latih. Meliputi daftar keseluruhan klien, pemantauan progres detail klien lewat grafik historis berat badan (`weight_logs`), dan aksi krusial me-review *Weekly Plan* yang telah digenerasi oleh AI. PT berwenang untuk meresmikan (*Approve*) plan agar bisa diakses klien, atau melakukan intervensi manual (*Override*) terhadap menu makanan/olahraga bila dirasa ada yang kurang pas atau terjadi keadaan darurat (contoh: klien cedera di tengah minggu).

---

## Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /pt/klien` | PT | Mengambil list klien yang diterima oleh PT ini (dashboard-style/table list). |
| `GET /pt/klien/:id` | PT | Mengambil profil klien spesifik + histori berat badan (untuk konsumsi grafik Recharts). |
| `GET /pt/klien/:id/weekly-plan` | PT | Mengambil *weekly plan* "minggu berjalan" milik klien untuk direview. |
| `PUT /pt/weekly-plan/:id/approve` | PT | Menyetujui plan yang masih berstatus `pending_review`. |
| `PUT /pt/weekly-plan/:id/override` | PT | Mengubah manual (*overwrite*) JSON plan klien (dengan payload terstruktur) dan mengubah status menjadi `override`. |

---

## Business Rules

1. **Ownership Check Ganda (Security PENTING)**
   - **Endpoint berbasis Klien ID (`GET /pt/klien/:id` & `GET /pt/klien/:id/weekly-plan`)**: Wajib mengecek ke tabel `klien_profiles` apakah `pt_id === req.user.id`. Jika tidak, return HTTP 404 (bukan 403, untuk menyembunyikan kepemilikan klien dari luar).
   - **Endpoint berbasis Weekly Plan ID (`PUT /pt/weekly-plan/:id/...`)**: Parameter `:id` di URL ini merujuk pada PK tabel `weekly_plans`. Query **WAJIB** melakukan `JOIN` balik ke tabel `klien_profiles` (`weekly_plans.klien_id = klien_profiles.id`) untuk memeriksa bahwa `klien_profiles.pt_id === req.user.id`. Return HTTP 404 jika validasi ini meleset.

2. **List Klien (GET /pt/klien)**
   - Menampilkan SEMUA klien dengan `pt_id = req.user.id`. Konsisten penuh dengan definisi "Klien Aktif" pada *Dashboard PT*. 
   - Klien yang baru *pairing* dan belum punya *progress_cycles* atau *weight_logs* tetap wajib ditampilkan.
   - **Spesifikasi Field**: Berbeda dengan endpoint `GET /pt/riwayat` yang berfungsi sebagai laporan *read-only* lengkap (menampilkan usia, gender, BB awal-sekarang), endpoint `GET /pt/klien` ini bertujuan spesifik untuk navigasi cepat (via list) menuju halaman Detail Klien. Oleh karena itu, field yang dikembalikan (pada tipe `KlienItem`) dibuat seminimal mungkin (hanya `id` dan `nama`) demi efisiensi *payload* dan agar tidak tumpang tindih secara tujuan dengan fitur riwayat.

3. **Weekly Plan yang Perlu Direview (Resolusi "Minggu Berjalan")**
   - Mengambil *weekly plan* HARUS memakai query yang IDENTIK dengan *Dashboard PT*: Ambil **1 baris terbaru** per klien (diurutkan `minggu_mulai` DESC LIMIT 1) dengan filter `minggu_mulai <= CURRENT_DATE`.
   - Endpoint ini **TIDAK HANYA** mengembalikan status `pending_review`. Plan tetap dikembalikan apa pun statusnya (termasuk yang sudah `disetujui`/`override`).
   - Alasannya: PT butuh melihat plan aktif untuk minggu ini. *Frontend* yang akan menggunakan properti `status` dari response ini untuk men-disable (me-nonaktifkan) tombol *Setuju* atau mematikan state form.

4. **Validasi Approve (Pencegahan Double-Action)**
   - Eksekusi `PUT .../approve` **HANYA VALID** bila plan tersebut saat ini berstatus `pending_review`.
   - Jika *race condition* terjadi atau PT iseng menembak endpoint pada plan yang statusnya sudah `disetujui`/`override`, request ditolak dengan HTTP 400 `"Plan sudah disetujui atau dioverride sebelumnya"`.

5. **[KEPUTUSAN FINAL] Override Plan Berlaku Kapan Saja**
   - Endpoint `PUT .../override` **DIİZINKAN** untuk dieksekusi kapan saja (selama plan merupakan plan minggu berjalan), baik di saat plan masih `pending_review`, maupun jika **sudah `disetujui` atau di-`override` sebelumnya**.
   - **Alasan**: PRD Bugarin mendiktekan *use case* spesifik: *"PT override karena klien cedera"*. Cedera bisa terjadi di tengah minggu (misal hari Rabu) setelah plan berstatus `disetujui` pada hari Senin. Demi keselamatan dan fleksibilitas *coaching*, PT harus selalu memiliki kuasa penuh merombak/meng-override rencana mingguan klien yang sedang berjalan tersebut.
   - Tidak ada *versioning* yang kompleks. Fitur *override* akan murni me-replace JSON di baris itu dan mengubah status kolom menjadi `override`.

6. **Validasi Struktur Override JSON (Backend Zod)**
   - Meskipun frontend memiliki form terstruktur (bukan textarea mentah), Backend **WAJIB** memvalidasi *payload* JSON menggunakan Zod sebelum di-update ke *database*.
   - Payload harus divalidasi apakah struktur objek per item *workoutPlan* (hari, jam, jenis) dan *mealPlan* (waktu, menu, estimasiKalori) sesuai dan valid (terutama tipe *array*). 
   - **Injeksi Lokasi Gym**: PT **TIDAK** mengirimkan field `lokasi` (bukan bagian dari payload). Sesuai pola AI, lokasi gym SELALU di-inject secara internal oleh backend menggunakan data `pt_profiles.tempat_gym` milik PT yang sedang login saat menyimpan override. Ini memastikan konsistensi lokasi latihan per PT.

7. **Format Grafik BB Historis**
   - Data `weight_logs` diubah (di-map) menjadi array sederhana berformat `{ tanggal: string, beratKg: number }`.
   - Array **WAJIB** diurutkan (*sorted*) secara `tanggal ASC` (kronologis terlama ke terbaru) dari sisi backend untuk memudahkan render garis linier komponen Recharts di frontend.
   - Jika klien masih *kosong* riwayat BB-nya, kembalikan format array kosong `[]` secara terstruktur tanpa melempar error.

---

## Skema Data yang Dipakai

Tidak ada perubahan atau pembuatan skema/tabel baru.
- `klien_profiles` (id, nama, usia, tinggi, dll)
- `progress_cycles` (ambil status aktif untuk informasi target berat & kalori)
- `weight_logs` (klien_id, berat_badan_kg, tanggal)
- `weekly_plans` (id, klien_id, minggu_mulai, workout_plan, meal_plan, status)

---

## Response Shape

```typescript
// GET /pt/klien
// HTTP 200
type ListKlienResponse = {
  data: KlienItem[];
  meta: { total: number };
}

type KlienItem = {
  id: number;
  nama: string;
};

// GET /pt/klien/:id
// HTTP 200
type DetailKlienResponse = {
  data: {
    profil: KlienItem & { 
      usia: number; 
      tinggiBadanCm: number; 
      bbAwalKg: number | null; 
      bbTujuanKg: number | null; 
      tujuan: string | null 
    };
    grafikBb: { tanggal: string; beratKg: number }[]; // WAJIB Sorted Ascending by tanggal
  }
}

// GET /pt/klien/:id/weekly-plan
// HTTP 200
type WeeklyPlanResponse = {
  data: {
    id: number;
    mingguMulai: string;
    status: "pending_review" | "disetujui" | "override";
    workoutPlan: WorkoutPlanItem[]; // Di-import dari db/schema/weekly-plans.ts
    mealPlan: MealPlanItem[];       // Di-import dari db/schema/weekly-plans.ts
  } | null; // Null jika tak ada plan minggu berjalan sama sekali
}

// PUT /pt/weekly-plan/:id/approve
// HTTP 200
type ApproveResponse = {
  data: {
    id: number;
    status: "disetujui";
  }
}

// PUT /pt/weekly-plan/:id/override
// HTTP 200
type OverrideResponse = {
  data: {
    id: number;
    status: "override";
    workoutPlan: WorkoutPlanItem[]; // Di-import dari db/schema/weekly-plans.ts
    mealPlan: MealPlanItem[];       // Di-import dari db/schema/weekly-plans.ts
  }
}
```

---

## Validasi (Zod)

Semua endpoint dilindungi Auth Role PT: `authGuard(["pt"])`

**Zod Validasi Parameter URL**
`id` divalidasi ke numerik: `z.coerce.number().int().positive()`

**Zod Request Body (PUT `/pt/weekly-plan/:id/override`)**
```typescript
Body: z.object({
  workoutPlan: z.array(
    z.object({
      hari: z.string(),
      jam: z.string(),
      jenis: z.string()
    })
  ).min(1, "Workout plan minimal 1 jadwal"),
  mealPlan: z.array(
    z.object({
      waktu: z.string(),
      menu: z.string(),
      estimasiKalori: z.number().positive()
    })
  ).min(1, "Meal plan minimal 1 jadwal")
})
```

---

## File yang Akan Dibuat/Diubah

```
src/modules/pt/
  pt.routes.ts         [MODIFY] — tambah route (2 endpoint plan, 2 endpoint klien) 
  pt.controller.ts     [MODIFY] — tambah 5 pasang API handlers 
  pt.service.ts        [MODIFY] — tambah service logika untuk kelima endpoint
  pt.schema.ts         [MODIFY] — definisikan z.object() overridePlanSchema
```

---

## Urutan Implementasi

1. **Schema Validation (`pt.schema.ts`)**: Konfigurasikan Zod `overridePlanSchema` yang menguraikan format ketat struktur array objek `workoutPlan` dan `mealPlan`.
2. **List Klien (`pt.service.ts`)**: Bikin function query `SELECT` data profil klien difilter `WHERE pt_id = req.user.id`.
3. **Klien Detail (`pt.service.ts`)**: Lakukan *ownership check*, tarik biodata, cari progres aktif klien, lalu ekstrak `weight_logs` dan pastikan melakukan *ORDER BY tanggal ASC*.
4. **Plan Read (`pt.service.ts`)**: Terapkan logika query `minggu_mulai DESC LIMIT 1` (identik layaknya di fitur `dashboard-pt`) bersama *ownership check*.
5. **Approve Plan (`pt.service.ts`)**: Implementasi `JOIN klien_profiles` demi *ownership check plan* -> seleksi jika status `pending_review` -> eksekusi update DB menjadi `disetujui`.
6. **Override Plan (`pt.service.ts`)**: Implementasi *ownership check plan* -> validasi payload mentah pakai schema Zod -> timpa JSON di database dan ubah `status` ke `override` tanpa harus memedulikan status historis sebelumnya.
7. **Controller & Router**: Sambung seluruh service dengan framework Express. Tangkap error ownership lalu paksa lempar status HTTP 404 *Data tidak ditemukan*.

---

## Dependency ke Fitur Lain

| Dependency | Arah | Keterangan |
|---|---|---|
| `feat/dashboard-pt` | **Konvensi Logika Bersama** | Fitur ini bergantung pada kepastian resolusi query baris terbaru untuk "Minggu Berjalan" dan definisi "Klien Aktif". |
| Modul AI (Cron Job) | **Pemasok Data** | Bergantung sepenuhnya pada hasil *generate* weekly plan secara asinkron dari cron job sistem. PT hanya menyetujui, tidak mengeksekusi prompt LLM. |

---

## Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| Mencoba mengakses/melihat Klien atau Plan yang bukan miliknya | HTTP 404 `"Data tidak ditemukan"` |
| Klien belum memiliki history BB di `weight_logs` | `grafikBb: []` (Response Normal, Frontend akan menangani state kosong) |
| Klien belum memiliki siklus/progress aktif | Nilai BB Awal, BB Tujuan akan otomatis diisi `null` |
| `PUT /approve` ditembakkan pada plan yang berstatus `disetujui` | HTTP 400 Validation Error `"Plan sudah disetujui atau dioverride sebelumnya"` |
| `PUT /override` ditembakkan pada plan yang sudah `disetujui` | HTTP 200 (Success, overwrite plan yang sudah jalan tersebut) |
| Struktur JSON *body override* berantakan/ada field yang kurang | HTTP 400 (Zod Bad Request Error Message) |

---

## Definition of Done

- [ ] Seluruh endpoint List Klien, Detail Klien (dengan grafik Recharts array *ascending*), Retrieve Plan, Approve, dan Override terimplementasi.
- [ ] Pemeriksaan validitas kepemilikan data (Ownership Check Ganda) terintegrasi pada endpoint ID dan sukses menutupi identitas klien lain dengan 404.
- [ ] Logika `minggu_mulai DESC LIMIT 1` diterapkan identik untuk penentuan minggu yang sedang berjalan dengan *Dashboard PT*.
- [ ] Skenario Approve dilindungi dari pengerjaan dobel (dobel approve).
- [ ] Skenario Override disahkan untuk dilakukan kapan pun di sepanjang status lifecycle plan (termasuk cedera).
- [ ] Objek struktur manual (JSON Override) diamankan dengan verifikasi skema Zod ketat.
- [ ] Seluruh format PRD konsisten dan tidak menyarankan tabel baru/versi rekaman override.
- [ ] Laporan pengujian integratif pada endpoint ini lolos.
