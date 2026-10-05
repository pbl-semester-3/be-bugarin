# PRD Fitur: Dashboard Klien

## Metadata

| | |
|---|---|
| **Role** | Klien |
| **Branch** | `feat/dashboard-klien` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.1 |

## Referensi

- `docs/Bugarin_PRD_Backend_AI.md` bab 4.1 (endpoint dashboard-summary)
- `docs/Bugarin_PRD_Mobile.md` bab 3.3 (spesifikasi tampilan Dashboard)
- `docs/bugarin_schema_notes.md` bab 6 (Streak Logic OR) dan bagian reminder durasi lewat
- `docs/bugarin_erd.mermaid` — tabel `klien_profiles`, `progress_cycles`, `pt_profiles`, `weekly_plans`, `activity_logs`, `meal_logs`
- `docs/features/PRD-profil-onboarding-klien.md` (dependency: `progress_cycles` aktif)
- `docs/features/PRD-pt-ku-klien.md` (dependency: `klien_profiles.pt_id`, `weekly_plans` hasil trigger)
- `docs/WORKFLOW.md` bab 1 (Implementation Plan format)

## Ringkasan

Fitur Dashboard Klien menyediakan endpoint agregat murni (`GET /klien/dashboard-summary`) yang mengembalikan ringkasan data penting untuk beranda (dashboard) di Mobile App Klien. Data ini bersifat **read-only** (GET) dan mencakup informasi Personal Trainer (PT) aktif, target kalori harian, rentetan (streak) hari aktif, jadwal latihan mingguan, serta indikator pengingat waktu target. 

Endpoint ini didesain spesifik untuk kebutuhan UI Dashboard dan sangat bergantung pada kalkulasi serta referensi dari data log maupun profil yang berstatus aktif.

## Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /klien/dashboard-summary` | Klien | Mengambil agregat data ringkasan dashboard klien: PT, kalori, streak, jadwal mingguan, dan flag reminder durasi. |

## Business Rules

1. **Info PT Aktif**
   - Diambil dari `klien_profiles.pt_id` dengan melakukan relasi (JOIN) ke tabel `pt_profiles`.
   - Jika `pt_id` bernilai `null` (klien belum memiliki PT), maka properti/field `pt` pada *response* harus diisi `null` secara eksplisit, bukan objek kosong atau memicu error.

2. **Target Kalori Hari Ini**
   - Diambil dari field `target_kalori_per_hari` pada tabel `progress_cycles`.
   - Wajib mengambil data siklus yang berstatus `aktif` milik pengguna yang bersangkutan.
   - Jika tidak ada *progress cycle* yang aktif, kembalikan field ini dengan nilai `null`.

3. **Streak (Akumulatif per Siklus, Tidak Pernah Reset dalam Siklus)**
   - `streak` = jumlah **hari unik** (`DISTINCT tanggal`) yang memiliki minimal 1 `activity_logs` **ATAU** `meal_logs` (logika OR per tanggal), dihitung di dalam window siklus aktif (`tanggal >= progress_cycles.tanggal_mulai`; batas atas memakai `tanggal_selesai` bila siklus sudah selesai, atau tanggal hari ini bila masih aktif).
   - Nilai ini **akumulatif dan tidak pernah reset** selama siklus berjalan. Hari tanpa log hanya membuat nilai **beku** (tidak menambah, tidak kembali ke `0`).
   - Saat klien mencatat log lagi setelah jeda, nilai **dilanjutkan dari angka terakhir** (mis. `4` -> `5`), bukan dimulai ulang dari `1`.
   - Nilai dimulai dari `0` saat siklus baru dibuat (`POST /klien/progress-cycles`), sehingga streak **mengulang per siklus**.
   - Jika tidak ada siklus aktif, kembalikan `streak: 0`.
   - Disimpan persisten di kolom `progress_cycles.streak` dan di-update **realtime** setiap insert `activity_logs`/`meal_logs` dengan recompute `COUNT(DISTINCT tanggal)` (idempotent, aman dari double-count). Lihat `CATATAN.md`.

4. **Jadwal Latihan Mingguan**
   - Diambil dari field `workout_plan` pada tabel `weekly_plans` untuk minggu berjalan.
   - **Syarat Tampil (Kondisional Mobile):** Jadwal *hanya* boleh muncul / diekspos jika `weekly_plans.status` telah bernilai `disetujui` atau `override` oleh PT. Jika status masih `pending_review`, kembalikan array kosong `[]` sebagai tindakan preventif klien menjalankan *workout plan* yang belum divalidasi PT-nya.

5. **Banner Reminder Durasi Lewat**
   - Cek `progress_cycles` milik klien yang berstatus `aktif`.
   - Jika `NOW()` > (`tanggal_mulai` + `durasi_hari`) dan status cycle masih belum mencapai goal target berat badan, tandai kembalian properti boolean `isReminderActive: true`.
   - Jika belum terlewati atau tidak ada cycle aktif, berikan nilai `false`.

## Keputusan Desain (Open Questions / Gaps)

- **[RESOLVED — 2026-10-02] Performa Perhitungan Streak:** Diputuskan memakai **nilai persisten** `progress_cycles.streak` yang di-recompute realtime saat insert log (bukan loop mundur on-read). Ini menghilangkan beban kalkulasi streak dari `GET /dashboard-summary` dan mendukung streak akumulatif per siklus. Backfill data lama lewat `npm run db:backfill-streak`. Detail: `CATATAN.md`.
- **Batasan Murni Read-Only (Tanpa Side-Effect):** Tidak boleh ada aksi yang mengubah status atau men-trigger *weekly_plan* via AI saat dashboard diakses. Ini mutlak dibebankan pada proses lain.

## Skema Data

Ada **1 perubahan skema** (sejak revisi 2026-10-02): kolom `progress_cycles.streak`
(`int NOT NULL DEFAULT 0`) untuk menyimpan streak akumulatif per siklus. Migration lewat
`npm run db:generate`, lalu backfill data lama lewat `npm run db:backfill-streak`.

Seluruh dependensi lain merujuk pada existing Drizzle schema:
- `klien_profiles`
- `pt_profiles`
- `progress_cycles`
- `weekly_plans`
- `activity_logs`
- `meal_logs`

## Response Shape

Data model disesuaikan persis untuk menanggapi permintaan UI, dalam aturan *camelCase*:

```typescript
// GET /klien/dashboard-summary
// { data: DashboardSummary }

type DashboardSummary = {
  pt: {
    id: number;
    nama: string;
    spesialisasi: "turun_bb" | "naik_bb";
  } | null;
  targetKaloriHariIni: number | null;
  kaloriMasukHariIni: number | null; // SUM meal_logs hari ini; 0 bila ada cycle aktif tanpa log; null bila tidak ada cycle aktif
  streak: number;
  jadwalMingguan: WorkoutPlanItem[]; // Menggunakan struct JSON database, Array kosong jika masih pending_review
  isReminderActive: boolean;
  unreadFeedbackCount: number; // jumlah feedbacks dibaca=false (tambahan dari fitur feedback-klien)
};

type WorkoutPlanItem = {
  hari: string;
  jam: string;
  jenis: string;
  lokasi: string;
};
```

## Validasi

Tidak dibutuhkan input params atau request body (menggunakan autentikasi header untuk mengekstrak identitas klien `req.user.id`). Validasi dibatasi hanya via *middleware* auth (contoh: `authGuard(["klien"])`).

## File yang Akan Dibuat/Diubah

```
src/modules/klien/
  klien.routes.ts         [MODIFY] — tambah GET /dashboard-summary
  klien.controller.ts     [MODIFY] — tambah handler getDashboardSummary (memetakan hasil service ke response)
  klien.service.ts        [MODIFY] — tambah business logic agregat untuk getDashboardSummary
```

## Urutan Implementasi

1. `klien.service.ts`: Tambah method `getDashboardSummaryData(klienId: number)`
   - Ambil data `klien_profiles` JOIN dengan `pt_profiles`.
   - Ambil `progress_cycles` yang berstatus aktif (termasuk kolom `streak` persisten).
   - Ambil `weekly_plans` milik klien pada rentang minggu tersebut dan terapkan filter status (*disetujui/override*).
2. `klien.controller.ts`: Panggil service tersebut, bungkus payload di balutan format respons `data: {}`.
3. `klien.routes.ts`: Deklarasi `router.get('/dashboard-summary', authGuard(['klien']), ...)`
4. Testing via endpoint GET untuk validasi berbagai *edge cases*.

## Dependency ke Fitur Lain

| Dependency | Arah | Keterangan |
|---|---|---|
| `feat/profil-onboarding-klien` | **Bergantung ke sini** | Dashboard butuh `progress_cycles` berstatus `aktif` (menjadi landasan kalkulasi kalori & *reminder*). Jika klien belum *onboarding*, akan bernilai *null*/*false*. |
| `feat/pt-ku-klien` | **Bergantung ke sini** | PT profile & jadwal `weekly_plans` baru berpotensi muncul bila *pairing* diterima PT. |

## Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| Klien mendaftar tapi belum menyusun *progress_cycle* | `targetKaloriHariIni: null`, `isReminderActive: false`, `jadwalMingguan: []`, `streak: 0` |
| Klien belum di-*pairing* dengan PT | `pt: null` (tanpa return object error 404), `jadwalMingguan: []` |
| `weekly_plans` sudah di-generate AI namun PT belum mengeklik "Setuju" (*pending_review*) | `jadwalMingguan: []` (Disembunyikan demi keamanan medikasi aktivitas) |
| Klien berolahraga namun tidak mencatat asupan makan (atau sebaliknya) | `streak` tetap bertambah +1 untuk hari itu (berkat logika agregasi **OR** per tanggal) |
| Klien tidak log sehari atau beberapa hari (gap) | `streak` **beku** di angka terakhir, tidak reset ke 0 |
| Klien mulai log lagi setelah gap | `streak` **lanjut dari angka terakhir**, bukan mulai dari 1 |
| Klien memulai siklus baru (`POST /progress-cycles`) | `streak` siklus baru mulai dari `0` (mengulang per siklus) |
| Batas waktu siklus terlampaui (belum *selesai*) | `isReminderActive: true` |

## Definition of Done

- [ ] Endpoint `GET /klien/dashboard-summary` terimplementasi bersih di sisi Controller & Service.
- [ ] Logika `streak` memakai agregasi **OR** (`activity_logs` ATAU `meal_logs`), akumulatif per siklus, tidak pernah reset dalam siklus, dan tersimpan di `progress_cycles.streak`.
- [ ] Jadwal mingguan hanya mengeluarkan array jika *status* `weekly_plans` sesuai (`disetujui` / `override`).
- [ ] Banner reminder durasi dievaluasi murni dari perbandingan data siklus yang `aktif`.
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` lolos tanpa error.
- [ ] Laporan pengujian manual *(Manual test Postman)* menampung keberhasilan seluruh probabilitas *Edge Cases* minimal satu sampel per baris tabel.
- [ ] *Work Result* direkap & ditulis di tiket PR mengacu format `WORKFLOW.md` bab 5.
