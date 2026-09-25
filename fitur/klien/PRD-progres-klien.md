# PRD Fitur: Progres Klien

## Metadata

| | |
|---|---|
| **Role** | Klien |
| **Branch** | `feat/progres-klien` |
| **Status** | Sub-bab A: **Approved** — Sub-bab B: **Approved** — Sub-bab C: **Approved** |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.1 |

## Referensi

- `docs/Bugarin_PRD_Backend_AI.md` bab 4.1 (endpoint `activity-logs`, `meal-logs`) dan bab 5.2 (rumus kalkulasi kalori olahraga & makanan) dan bab 5.6 (master makanan dinamis)
- `docs/Bugarin_PRD_Mobile.md` bab 3.5 (spesifikasi tampilan tab Olahraga dan Meal di Progres)
- `docs/bugarin_erd.mermaid` — tabel `activity_logs`, `meal_logs`, `master_olahraga`, `master_makanan`, `weekly_plans`, `weight_logs`
- `docs/bugarin_schema_notes.md` bab 5 (Data Master — mekanisme `master_makanan` tumbuh dinamis, `sumber = ai_generated`) dan bab 6 (Activity & Meal Logs — snapshot, nullable `weekly_plan_id`, `jarak_meter` kondisional)
- `skills/drizzle-mysql-patterns` (pola query, ambil berat badan terkini dari `weight_logs`, get-or-create `master_makanan`)
- `skills/gemini-structured-output` (pola estimasi kalori makanan custom via AI — Pola 3)
- `src/modules/ai/food-estimation.ts` (fungsi `estimateFoodCalories()` yang sudah ada — **jangan dibuat ulang, cukup dipanggil**)
- `docs/features/PRD-profil-onboarding-klien.md` (sumber `weight_logs` pertama saat onboarding)
- `docs/features/PRD-pt-ku-klien.md` dan `PRD-dashboard-klien.md` (contoh format PRD fitur)

## Ringkasan

Fitur Progres Klien mencakup seluruh mekanisme pencatatan aktivitas harian klien di tab "Progres" pada Mobile App. Fitur ini terbagi tiga sub-bagian: **(A) Catat Olahraga** — insert log aktivitas olahraga dengan kalkulasi kalori terbakar berdasarkan rumus MET, **(B) Catat Makanan** — insert log asupan makanan dengan lookup/get-or-create dari master data dan kalkulasi kalori masuk, serta **(C) Weekly Plan Reference** — menampilkan jadwal latihan dan menu makan dari Weekly Plan yang telah di-approve PT sebagai panduan read-only di tab Progres.

---

## Sub-bab A: Catat Olahraga (Activity Logs)

**Status: Approved ✅**

### Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `POST /klien/activity-logs` | Klien | Insert log olahraga baru + hitung dan simpan `kaloriTerbakar` (snapshot) |

### Business Rules

1. **Request Body**

   | Field | Tipe | Required | Catatan |
   |---|---|---|---|
   | `olahragaId` | `number` (int, positive) | Ya | Referensi `master_olahraga.id` |
   | `durasiMenit` | `number` (int, positive) | Ya | Durasi olahraga dalam menit |
   | `jarakMeter` | `number` (float, positive) | Kondisional | Lihat aturan #2 di bawah |
   | `weeklyPlanId` | `number` (int, positive) \| `null` | Tidak | Diisi jika log berasal dari checklist item Weekly Plan, `null`/tidak dikirim jika input manual di luar plan |

2. **Validasi Kondisional `jarakMeter`**

   - Lookup `master_olahraga` berdasarkan `olahragaId` yang dikirim klien.
   - Jika `olahragaId` tidak ditemukan di `master_olahraga` → HTTP 404 `"Jenis olahraga tidak ditemukan"`.
   - Jika `master_olahraga.butuhJarak = true` untuk olahraga tsb → `jarakMeter` **wajib** diisi dan bernilai positif. Jika tidak dikirim atau ≤ 0 → HTTP 400 (Zod validation error).
   - **Keputusan Final:** Jika `master_olahraga.butuhJarak = false` tapi klien tetap mengirim `jarakMeter` → **diabaikan** (bukan error). Service layer men-set `jarakMeter = null` sebelum insert ke `activity_logs` — field yang dikirim klien tidak divalidasi dan tidak disimpan. Pendekatan lenient ini dipilih karena frontend tidak selalu bersih, dan data jarak tidak relevan untuk olahraga yang tidak membutuhkannya.

3. **Kalkulasi `kaloriTerbakar`**

   Rumus baku dari `Bugarin_PRD_Backend_AI.md` bab 5.2, **jangan buat rumus baru**:

   ```
   kaloriTerbakar = master_olahraga.met_value × beratBadanKg × (durasiMenit / 60)
   ```

   - `met_value`: dari record `master_olahraga` yang sesuai `olahragaId`.
   - `beratBadanKg`: dari entry **terbaru** `weight_logs` milik klien yang sedang login. Query eksplisit:
     ```
     SELECT berat_badan_kg FROM weight_logs
     WHERE klien_id = :klienId
     ORDER BY tanggal DESC
     LIMIT 1
     ```
     Ini mengambil berat badan aktual terakhir (bukan `bb_awal_kg` dari `progress_cycles`) — sesuai spesifikasi PRD Backend bab 5.2 yang menyatakan _"`berat_badan_kg` diambil dari `weight_logs` terbaru klien saat itu"_.
   - Hasil dihitung dan **disimpan sebagai snapshot** saat insert — tidak dihitung ulang saat dibaca. Ini memastikan histori kalori tidak berubah walau data master atau berat badan klien berubah di kemudian hari.
   - Bulatkan hasil ke integer terdekat (`Math.round()`) sebelum simpan, sesuai tipe kolom `kalori_terbakar INT` di schema.

4. **Validasi `weeklyPlanId` (jika dikirim)**

   - Jika `weeklyPlanId` dikirim (bukan null), cek apakah `weekly_plans` dengan ID tsb ada **dan** milik klien yang sama (`weekly_plans.klien_id = klienId`) → jika tidak ditemukan atau bukan milik klien → HTTP 404.
   - Jika tidak dikirim / null → simpan sebagai null (log manual di luar plan).

5. **Field `tanggal`**

   - Di-set oleh backend ke tanggal hari ini (`CURRENT_DATE()` / `new Date().toISOString().slice(0, 10)`) — **bukan** input dari klien. Klien tidak bisa backdate log olahraga.

6. **Tanpa Side-Effect Tambahan**

   - Endpoint ini **hanya** insert ke `activity_logs`. Tidak trigger recalculation streak, tidak update progress cycle, tidak trigger AI feedback. Semua itu adalah tanggung jawab endpoint/proses lain yang membaca data ini.

### Skema Data yang Dipakai (Tidak Ada Perubahan Schema)

Semua tabel yang dipakai sudah ada di Drizzle schema. Tidak ada migration baru.

```
activity_logs      (sudah ada)
  id               INT PK auto-increment
  klien_id         FK → klien_profiles.id    [INDEX composite (klien_id, tanggal)]
  weekly_plan_id   FK nullable → weekly_plans.id
  olahraga_id      FK → master_olahraga.id
  durasi_menit     INT NOT NULL
  jarak_meter      FLOAT nullable
  kalori_terbakar  INT NOT NULL              ← snapshot, dihitung saat insert
  tanggal          DATE NOT NULL

master_olahraga    (sudah ada, read-only di fitur ini)
  id, nama, met_value, kategori, butuh_jarak

weight_logs        (sudah ada, read-only di fitur ini)
  klien_id, berat_badan_kg, tanggal          ← dipakai untuk ambil BB terkini
```

### Response Shape

```typescript
// POST /klien/activity-logs
// HTTP 201
// { data: CreatedActivityLog }

type CreatedActivityLog = {
  id: number;
  olahragaId: number;
  durasiMenit: number;
  jarakMeter: number | null;
  kaloriTerbakar: number;     // hasil kalkulasi MET, integer
  tanggal: string;            // format YYYY-MM-DD
  weeklyPlanId: number | null;
};
```

> Response mengembalikan data log yang baru saja dibuat — dipakai UI Mobile untuk update tampilan post-submit (menampilkan kalori terbakar yang dihitung backend). Tidak menyertakan field yang tidak dibutuhkan UI (seperti `klienId`, `createdAt`, atau data master olahraga — UI sudah punya data master dari dropdown yang di-fetch sebelumnya).

### Validasi (Zod)

```
createActivityLogSchema:
  olahragaId:   number.int().positive()
  durasiMenit:  number.int().positive()
  jarakMeter:   number.positive().optional()    ← validasi kondisional (butuhJarak) dilakukan di service layer setelah lookup master, bukan di Zod murni
  weeklyPlanId: number.int().positive().optional()
```

> **Catatan**: Zod schema hanya memvalidasi tipe dan constraint dasar. Validasi bisnis kondisional (`butuhJarak`, kepemilikan `weeklyPlanId`, keberadaan `olahragaId` di master) dilakukan di service layer karena membutuhkan query database.

### Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| `olahragaId` tidak ada di `master_olahraga` | HTTP 404 `"Jenis olahraga tidak ditemukan"` |
| `butuhJarak = true` tapi `jarakMeter` tidak dikirim atau ≤ 0 | HTTP 400 (validasi gagal, field jarak wajib) |
| `butuhJarak = false` tapi `jarakMeter` dikirim | `jarakMeter` diabaikan (di-null-kan), activity log tetap tersimpan normal, HTTP 201 |
| `weeklyPlanId` dikirim tapi tidak ditemukan atau bukan milik klien | HTTP 404 |
| Klien belum pernah punya `weight_logs` (tidak ada BB terkini untuk rumus MET) | HTTP 422 `"Berat badan belum tercatat. Lengkapi profil terlebih dahulu."` — skenario ini seharusnya tidak terjadi jika onboarding benar (onboarding meng-insert `weight_logs` pertama), tetapi tetap wajib di-handle sebagai safety net |
| `durasiMenit` = 0 atau negatif | HTTP 400 (Zod: `number.int().positive()`) |

---

## Sub-bab B: Catat Makanan (Meal Logs)

### Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `POST /klien/meal-logs` | Klien | Insert log makanan baru + resolve makanan dari master (atau create via AI) + hitung dan simpan `kaloriMasuk` (snapshot) |

> **Satu request = satu item makanan.** PRD Backend bab 4.1 mendefinisikan `POST /klien/meal-logs` sebagai singular, dan schema `meal_logs` menyimpan satu `makanan_id` per row. Jika klien mencatat 3 item makanan sekaligus dari UI, frontend mengirim 3 request terpisah — bukan array/batch.

### Business Rules

1. **Request Body**

   | Field | Tipe | Required | Catatan |
   |---|---|---|---|
   | `makananId` | `number` (int, positive) | Salah satu dari `makananId` atau `namaMakanan` wajib ada | Referensi `master_makanan.id` — dipakai jika klien memilih dari preset/dropdown |
   | `namaMakanan` | `string` (min 1, max 150) | Salah satu dari `makananId` atau `namaMakanan` wajib ada | Dipakai jika klien mengetik menu custom yang tidak ada di dropdown |
   | `porsiGram` | `number` (float, positive) | Ya | Porsi dalam gram |
   | `weeklyPlanId` | `number` (int, positive) \| `null` | Tidak | Sama seperti Sub-bab A: diisi jika dari checklist Weekly Plan, null jika input manual |

   - Jika **keduanya** (`makananId` DAN `namaMakanan`) dikirim bersamaan → `makananId` diutamakan, `namaMakanan` diabaikan. Ini mencegah ambiguitas.
   - Jika **tidak ada satupun** yang dikirim → HTTP 400 `"Harus mengirim makananId atau namaMakanan"`.

2. **Alur Resolve Makanan (Get-or-Create `master_makanan`)**

   **Jalur A — `makananId` dikirim (klien pilih dari preset/dropdown):**
   - Lookup `master_makanan` by ID.
   - Jika tidak ditemukan → HTTP 404 `"Makanan tidak ditemukan"`.
   - Jika ditemukan → gunakan `kaloriPer100g` dari record tsb untuk kalkulasi.

   **Jalur B — `namaMakanan` dikirim (klien ketik custom):**
   1. Cari di `master_makanan` by nama (**exact match**, case-insensitive).
      ```
      SELECT * FROM master_makanan WHERE LOWER(nama) = LOWER(:namaMakanan) LIMIT 1
      ```
   2. **Jika ketemu** → gunakan record yang ada (termasuk `kaloriPer100g`-nya). Tidak perlu panggil AI.
   3. **Jika tidak ketemu** → panggil `estimateFoodCalories(namaMakanan)` dari `src/modules/ai/food-estimation.ts` (fungsi sudah ada, **jangan buat ulang**) → insert entry baru ke `master_makanan` dengan `sumber = 'ai_generated'` → gunakan entry baru tsb.
   4. Setelah resolve (baik ketemu maupun baru dibuat), lanjutkan ke kalkulasi kalori dengan `makananId` dari record yang di-resolve.

   > **[OPEN QUESTION] Exact Match vs Fuzzy Match:** Saat ini alur menggunakan exact match (case-insensitive) untuk pencarian `namaMakanan` di `master_makanan`. Apakah perlu fuzzy/partial match (misal "Nasi Goreng" cocokkan dengan "nasi goreng ayam")? Fuzzy match mencegah duplikasi entry yang mirip tapi tidak identik, tapi menambah kompleksitas dan risiko false positive (klien ketik "Nasi" tapi di-match ke "Nasi Goreng" yang kalorinya berbeda). **Keputusan ditangguhkan — untuk MVP, exact match (case-insensitive) cukup aman. Bisa ditinjau ulang setelah ada data real dari penggunaan.**

3. **Kalkulasi `kaloriMasuk`**

   Rumus baku dari `Bugarin_PRD_Backend_AI.md` bab 5.2, **jangan buat rumus baru**:

   ```
   kaloriMasuk = master_makanan.kalori_per_100g × (porsiGram / 100)
   ```

   - `kaloriPer100g`: dari record `master_makanan` yang sudah di-resolve (jalur A atau B di atas).
   - Hasil dihitung dan **disimpan sebagai snapshot** saat insert — tidak dihitung ulang saat dibaca. Histori tidak berubah walau data master di-update nanti.
   - Bulatkan hasil ke integer terdekat (`Math.round()`) sebelum simpan, sesuai tipe kolom `kalori_masuk INT` di schema.

4. **Validasi `weeklyPlanId` (jika dikirim)**

   - Sama persis dengan Sub-bab A: cek exist **dan** ownership (`weekly_plans.klien_id = klienId`) → 404 jika gagal.

5. **Field `tanggal`**

   - Sama persis dengan Sub-bab A: di-set backend ke hari ini, bukan input klien.

6. **Tanpa Side-Effect Tambahan**

   - Endpoint ini **hanya** insert ke `meal_logs` (dan potensial insert ke `master_makanan` jika get-or-create). Tidak trigger recalculation streak, tidak trigger AI feedback, tidak update progress cycle.

### Skema Data yang Dipakai (Tidak Ada Perubahan Schema)

Semua tabel sudah ada. Tidak ada migration baru.

```
meal_logs           (sudah ada)
  id                INT PK auto-increment
  klien_id          FK → klien_profiles.id    [INDEX composite (klien_id, tanggal)]
  weekly_plan_id    FK nullable → weekly_plans.id
  makanan_id        FK → master_makanan.id
  porsi_gram        FLOAT NOT NULL
  kalori_masuk      INT NOT NULL               ← snapshot, dihitung saat insert
  tanggal           DATE NOT NULL

master_makanan      (sudah ada, bisa INSERT baru jika get-or-create trigger)
  id                INT PK auto-increment
  nama              VARCHAR(150) UNIQUE
  kalori_per_100g   FLOAT NOT NULL
  kategori          ENUM('karbohidrat','protein','sayur','lainnya')
  sumber            ENUM('seed','ai_generated') DEFAULT 'seed'
  created_at        TIMESTAMP
```

### Response Shape

```typescript
// POST /klien/meal-logs
// HTTP 201
// { data: CreatedMealLog }

type CreatedMealLog = {
  id: number;
  makananId: number;
  namaMakanan: string;       // dari master_makanan.nama — dipakai UI untuk konfirmasi visual post-submit
  porsiGram: number;
  kaloriMasuk: number;       // hasil kalkulasi, integer
  tanggal: string;           // format YYYY-MM-DD
  weeklyPlanId: number | null;
};
```

> Response menyertakan `namaMakanan` (dari master yang di-resolve) supaya UI bisa menampilkan nama makanan final tanpa lookup ulang. Field `klienId` dan `createdAt` tidak disertakan (tidak dibutuhkan UI).

### Validasi (Zod)

```
createMealLogSchema:
  makananId:    number.int().positive().optional()
  namaMakanan:  string.min(1).max(150).optional()
  porsiGram:    number.positive()
  weeklyPlanId: number.int().positive().optional()

  + refine: salah satu dari makananId atau namaMakanan HARUS ada
            (validasi mutual requirement, bukan mutual exclusion — kalau dua-duanya ada, makananId diutamakan)
```

> **Catatan**: `refine()` Zod dipakai untuk validasi cross-field "minimal salah satu harus ada". Logika prioritas (`makananId` menang atas `namaMakanan`) dilakukan di service layer.

### Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| `makananId` tidak ada di `master_makanan` | HTTP 404 `"Makanan tidak ditemukan"` |
| Tidak ada `makananId` maupun `namaMakanan` di body | HTTP 400 `"Harus mengirim makananId atau namaMakanan"` |
| `namaMakanan` dikirim, makanan sudah ada di master (exact match) | Gunakan record yang ada, **tidak** panggil AI, HTTP 201 |
| `namaMakanan` dikirim, makanan belum ada di master | Panggil `estimateFoodCalories()`, insert ke `master_makanan` (`sumber='ai_generated'`), lanjut insert `meal_logs`, HTTP 201 |
| `estimateFoodCalories()` gagal / timeout (Gemini API error) | HTTP 502 `"Gagal memproses estimasi kalori. Coba lagi nanti."` — jangan insert `meal_logs` tanpa kalori yang valid |
| `estimateFoodCalories()` return angka di luar rentang wajar (< 0 atau > 900) | Fungsi `estimateFoodCalories()` sudah handle ini internal (fallback ke `{ kaloriPer100g: 150, kategori: 'lainnya' }`) — insert tetap berjalan dengan nilai fallback |
| `porsiGram` = 0 atau negatif | HTTP 400 (Zod: `number.positive()`) |
| `weeklyPlanId` dikirim tapi tidak ditemukan atau bukan milik klien | HTTP 404 |
| Dua klien submit `namaMakanan` yang sama secara bersamaan (race condition pada get-or-create) | `master_makanan.nama` sudah UNIQUE — jika insert gagal karena duplicate key, catch error dan fallback ke SELECT yang baru saja di-insert oleh request lain, lalu lanjut normal |

---

## Sub-bab C: Weekly Plan Reference

### Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /klien/weekly-plan/current` | Klien | Ambil Weekly Plan minggu berjalan milik klien (workout + meal plan) sebagai referensi read-only di tab Progres |

### Business Rules

1. **Read-Only, Tanpa Input**

   - Endpoint ini murni GET. Tidak ada request body, query params, atau path params selain autentikasi (identitas klien dari `req.user.id`).

2. **Filter Minggu Berjalan**

   - Ambil `weekly_plans` milik klien (`weekly_plans.klien_id = klienId`) yang `minggu_mulai`-nya berada pada minggu kalender berjalan (Senin–Minggu berdasarkan tanggal hari ini).
   - Jika ada lebih dari satu record untuk minggu yang sama (misal override menghasilkan row baru), ambil yang paling baru (`ORDER BY generated_at DESC LIMIT 1`).

3. **Filter Status — Sama Persis dengan Dashboard**

   - Weekly Plan **hanya** dikembalikan jika `status` bernilai `disetujui` atau `override`. Jika status masih `pending_review`, plan dianggap "belum ada" dari sudut pandang klien — tidak boleh ditampilkan karena belum divalidasi PT.
   - Aturan ini **identik** dengan `PRD-dashboard-klien.md` Business Rule #4 (Jadwal Latihan Mingguan). Tidak ada perbedaan filter antara Dashboard dan tab Progres.

4. **Response Jika Tidak Ada Plan yang Lolos Filter**

   - Jika tidak ada `weekly_plans` untuk minggu ini yang statusnya `disetujui` atau `override` (baik karena belum pernah di-generate, atau masih `pending_review`), kembalikan `data: null` — **bukan** HTTP 404, **bukan** objek kosong, dan **bukan** array kosong.
   - Pola `null` dipilih karena ini single-resource (bukan list), konsisten dengan pola `GET /klien/pairing-requests/current` di `PRD-pt-ku-klien.md` yang juga mengembalikan `data: null` saat tidak ada data.

5. **Tanpa Side-Effect**

   - Endpoint ini murni read. Tidak trigger generate plan, tidak update status, tidak mengubah data apapun.

### Skema Data yang Dipakai (Tidak Ada Perubahan Schema)

Semua tabel sudah ada. Tidak ada migration baru.

```
weekly_plans       (sudah ada, read-only di fitur ini)
  id               INT PK
  klien_id         FK → klien_profiles.id
  minggu_mulai     DATE NOT NULL
  workout_plan     JSON  → WorkoutPlanItem[]
  meal_plan        JSON  → MealPlanItem[]
  status           ENUM('pending_review','disetujui','override')
  generated_at     TIMESTAMP
  reviewed_at      TIMESTAMP nullable
```

Type JSON sudah didefinisikan di `src/db/schema/weekly-plans.ts` — **jangan definisikan ulang**:

```typescript
// Dari src/db/schema/weekly-plans.ts — import dari sini, jangan buat shape baru
type WorkoutPlanItem = {
  hari: string;
  jam: string;
  jenis: string;
  lokasi: string;   // diisi backend dari pt_profiles.tempat_gym
};

type MealPlanItem = {
  waktu: string;
  menu: string;
  estimasiKalori: number;
};
```

### Response Shape

```typescript
// GET /klien/weekly-plan/current
// HTTP 200
// { data: CurrentWeeklyPlan | null }

type CurrentWeeklyPlan = {
  id: number;
  mingguMulai: string;              // format YYYY-MM-DD
  status: "disetujui" | "override";  // pending_review tidak pernah muncul di response
  workoutPlan: WorkoutPlanItem[];    // dari kolom JSON apa adanya
  mealPlan: MealPlanItem[];          // dari kolom JSON apa adanya
};
```

> Response mengembalikan plan apa adanya dari kolom JSON database, tidak ada transformasi atau enrichment tambahan. Field `klienId`, `generatedAt`, `reviewedAt` tidak disertakan (tidak dibutuhkan UI tab Progres).

### Validasi (Zod)

Tidak dibutuhkan — endpoint ini GET tanpa input apapun. Auth via `authGuard(['klien'])` saja.

### Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| Klien belum pernah punya weekly plan (belum punya PT, atau PT belum lengkapi profil) | `data: null` |
| Weekly plan minggu ini ada tapi masih `pending_review` (PT belum approve) | `data: null` — dianggap "belum ada plan" dari sudut pandang klien |
| Weekly plan minggu ini berstatus `disetujui` | Return plan lengkap (workout + meal), HTTP 200 |
| Weekly plan minggu ini berstatus `override` (PT sudah edit manual) | Return plan yang sudah di-override, HTTP 200 |
| Ada beberapa weekly plan untuk minggu yang sama (misal generate ulang) | Ambil yang `generated_at` paling baru, filter status tetap berlaku |

---

## File yang Akan Dibuat/Diubah (Sub-bab A + B + C)

```
src/modules/klien/
  klien.routes.ts         [MODIFY] — tambah POST /activity-logs, POST /meal-logs, GET /weekly-plan/current
  klien.controller.ts     [MODIFY] — tambah handler createActivityLog, createMealLog, getCurrentWeeklyPlan
  klien.service.ts        [MODIFY] — tambah business logic createActivityLog, createMealLog, getCurrentWeeklyPlan
                            (Sub-bab A: lookup master_olahraga, ambil weight_logs terbaru,
                             hitung kalori MET, insert activity_logs)
                            (Sub-bab B: resolve master_makanan via get-or-create,
                             hitung kalori masuk, insert meal_logs)
                            (Sub-bab C: query weekly_plans minggu berjalan, filter status)
  klien.schema.ts         [MODIFY] — tambah createActivityLogSchema dan createMealLogSchema (Zod)
```

## Urutan Implementasi (Sub-bab A)

1. `klien.schema.ts` — definisi `createActivityLogSchema` (Zod: olahragaId, durasiMenit, jarakMeter optional, weeklyPlanId optional)
2. `klien.service.ts` — tambah `createActivityLog(klienId, input)`:
   - Lookup `master_olahraga` by `olahragaId` → 404 jika tidak ada
   - Validasi kondisional `jarakMeter` vs `butuhJarak` — kalau `butuhJarak = false`, set `jarakMeter = null` sebelum insert
   - Validasi `weeklyPlanId` (jika ada) → 404 jika tidak milik klien
   - Query `weight_logs` terbaru klien → 422 jika tidak ada
   - Hitung `kaloriTerbakar = metValue × beratBadanKg × (durasiMenit / 60)`, bulatkan
   - Insert ke `activity_logs`, return data yang baru dibuat
3. `klien.controller.ts` — handler `createActivityLog`: parse body dengan Zod, panggil service, return 201
4. `klien.routes.ts` — `router.post('/activity-logs', authGuard(['klien']), asyncHandler(createActivityLog))`
5. Manual test via Postman untuk semua edge cases

## Urutan Implementasi (Sub-bab B)

1. `klien.schema.ts` — definisi `createMealLogSchema` (Zod: makananId optional, namaMakanan optional, porsiGram, weeklyPlanId optional, refine cross-field)
2. `klien.service.ts` — tambah `createMealLog(klienId, input)`:
   - Jika `makananId` dikirim → lookup `master_makanan` by ID → 404 jika tidak ada
   - Jika hanya `namaMakanan` dikirim → cari `master_makanan` by nama (exact match, case-insensitive) → kalau ketemu pakai itu → kalau tidak ketemu panggil `estimateFoodCalories(namaMakanan)`, insert ke `master_makanan` dengan `sumber='ai_generated'`, handle duplicate key race condition
   - Validasi `weeklyPlanId` (jika ada) → 404 jika tidak milik klien
   - Hitung `kaloriMasuk = kaloriPer100g × (porsiGram / 100)`, bulatkan
   - Insert ke `meal_logs`, return data yang baru dibuat + `namaMakanan`
3. `klien.controller.ts` — handler `createMealLog`: parse body dengan Zod, panggil service, return 201
4. `klien.routes.ts` — `router.post('/meal-logs', authGuard(['klien']), asyncHandler(createMealLog))`
5. Manual test via Postman untuk semua edge cases (termasuk get-or-create dan AI fallback)

## Urutan Implementasi (Sub-bab C)

1. `klien.service.ts` — tambah `getCurrentWeeklyPlan(klienId)`: query `weekly_plans` WHERE `klien_id = klienId` AND `minggu_mulai` dalam rentang minggu berjalan AND `status IN ('disetujui', 'override')`, ORDER BY `generated_at DESC`, LIMIT 1. Return null jika tidak ada.
2. `klien.controller.ts` — handler `getCurrentWeeklyPlan`: panggil service, return `{ data: result }` (result bisa null)
3. `klien.routes.ts` — `router.get('/weekly-plan/current', authGuard(['klien']), asyncHandler(getCurrentWeeklyPlan))`
4. Manual test via Postman: plan disetujui, plan override, plan pending_review (harus null), tidak ada plan (harus null)

## Dependency ke Fitur Lain (Sub-bab A + B + C)

| Dependency | Arah | Keterangan |
|---|---|---|
| `feat/profil-onboarding-klien` | **Bergantung ke sini** | Onboarding meng-insert `weight_logs` pertama — tanpa itu, `createActivityLog` akan return 422 saat ambil BB terkini. Implementasikan fitur ini setelah onboarding selesai, atau seed `weight_logs` saat testing. |
| `feat/dashboard-klien` | **Fitur lain bergantung ke sini** | Dashboard menghitung streak dari `EXISTS(activity_logs) OR EXISTS(meal_logs)` — insert yang dilakukan kedua endpoint ini secara tidak langsung mempengaruhi angka streak, tapi streak dihitung on-read oleh dashboard, bukan sebagai side-effect dari insert. |
| `feat/pt-ku-klien` / Cron Job | **Bergantung ke sini (Sub-bab C)** | Weekly Plan harus sudah di-generate (oleh cron job atau trigger saat pairing diterima) dan di-approve PT sebelum Sub-bab C bisa mengembalikan data. Tanpa itu, endpoint selalu return `null`. |
| Master Data (`GET /master/olahraga`, `GET /master/makanan?q=`) | **Dipakai di sini** | Dropdown olahraga dan makanan di UI Mobile di-populate dari endpoint master data yang sudah ada. |
| `src/modules/ai/food-estimation.ts` | **Dipakai di Sub-bab B** | Fungsi `estimateFoodCalories()` dipanggil saat get-or-create `master_makanan` — fungsi ini sudah ada dan sudah include validasi rentang + fallback. **Jangan buat ulang.** |

## Definition of Done (Sub-bab A)

- [ ] Endpoint `POST /klien/activity-logs` terimplementasi sesuai layering `express-typescript-patterns` (routes → controller → service)
- [ ] Kalkulasi `kaloriTerbakar` memakai persis rumus MET dari PRD Backend bab 5.2
- [ ] `beratBadanKg` yang dipakai dalam rumus diambil dari `weight_logs` terbaru (bukan `bb_awal_kg` cycle)
- [ ] Validasi kondisional `jarakMeter` vs `butuhJarak` berjalan benar — `butuhJarak = false` dengan `jarakMeter` dikirim → di-null-kan tanpa error
- [ ] `kaloriTerbakar` disimpan sebagai snapshot (tidak dihitung ulang saat dibaca)
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` lolos tanpa error
- [ ] Manual test via Postman untuk **semua edge cases** di tabel Sub-bab A
- [ ] Work Result ditulis di PR sesuai format `WORKFLOW.md` bab 5

## Definition of Done (Sub-bab B)

- [ ] Endpoint `POST /klien/meal-logs` terimplementasi sesuai layering `express-typescript-patterns`
- [ ] Alur get-or-create `master_makanan` berjalan benar: lookup by ID, lookup by nama (exact match), atau create via AI
- [ ] `estimateFoodCalories()` dipanggil dari `ai/food-estimation.ts` yang sudah ada, **bukan** fungsi baru
- [ ] Kalkulasi `kaloriMasuk` memakai persis rumus dari PRD Backend bab 5.2
- [ ] `kaloriMasuk` disimpan sebagai snapshot
- [ ] Race condition pada get-or-create (duplicate key) di-handle gracefully
- [ ] Open Question (exact match vs fuzzy) didokumentasikan sebagai keputusan MVP
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` lolos tanpa error
- [ ] Manual test via Postman untuk **semua edge cases** di tabel Sub-bab B (termasuk skenario AI gagal/timeout)
- [ ] Work Result ditulis di PR sesuai format `WORKFLOW.md` bab 5

## Definition of Done (Sub-bab C)

- [ ] Endpoint `GET /klien/weekly-plan/current` terimplementasi sesuai layering `express-typescript-patterns`
- [ ] Filter status konsisten dengan `PRD-dashboard-klien.md` Business Rule #4 — hanya `disetujui` dan `override` yang dikembalikan
- [ ] Response `data: null` jika tidak ada plan yang lolos filter (bukan 404, bukan array kosong)
- [ ] Type `WorkoutPlanItem` dan `MealPlanItem` di-import dari `src/db/schema/weekly-plans.ts`, **bukan** didefinisikan ulang
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` lolos tanpa error
- [ ] Manual test via Postman untuk **semua edge cases** di tabel Sub-bab C
- [ ] Work Result ditulis di PR sesuai format `WORKFLOW.md` bab 5
