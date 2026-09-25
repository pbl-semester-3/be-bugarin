# PRD Fitur: Riwayat Klien

## Metadata

| | |
|---|---|
| **Role** | Klien |
| **Branch** | `feat/riwayat-klien` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.1 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.1 (fitur "Riwayat Progres") dan bab 6.1 (business rule "Riwayat per siklus")
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.1 (kontrak endpoint klien — `GET /klien/progress-cycles/:id/logs`)
- `docs/Bugarin_PRD_Mobile.md` bab 3.6 (spesifikasi tampilan layar Riwayat)
- `docs/bugarin_schema_notes.md` bab 3 (Progress Cycles & Weight Tracking, bagian "Riwayat per siklus") dan bab 6 (Activity & Meal Logs — snapshot kalori saat insert)
- `docs/bugarin_erd.mermaid` — tabel `progress_cycles`, `activity_logs`, `meal_logs` (perhatikan: **tidak ada FK** dari tabel log ke `progress_cycles`)
- `docs/features/PRD-profil-onboarding-klien.md` — dependency: endpoint `GET /klien/progress-cycles` dan `POST /klien/progress-cycles` **sudah didefinisikan dan diimplementasikan** di branch `feat/profil-onboarding-klien`
- `docs/features/PRD-dashboard-klien.md` — referensi format PRD
- `docs/features/PRD-pt-ku-klien.md` — referensi format PRD
- `docs/features/PRD-progres-klien.md` — `kalori_terbakar` dan `kalori_masuk` adalah snapshot yang dihitung saat insert (jangan hitung ulang di fitur ini)
- `skills/express-typescript-patterns` (layering routes → controller → service)
- `skills/drizzle-mysql-patterns` (query patterns, indexing `activity_logs` dan `meal_logs` composite `(klien_id, tanggal)`)
- `skills/api-contract-bugarin` (konvensi response envelope, field camelCase, null eksplisit)
- `skills/jwt-auth-security` (ownership check — klien A tidak boleh akses data klien B via ID di URL)
- `skills/gemini-structured-output` — **dikonfirmasi: fitur ini TIDAK butuh AI sama sekali**. Murni query agregasi database.

## Ringkasan

Fitur Riwayat Klien melengkapi halaman "Riwayat" di Mobile App dengan kemampuan melihat daily log (kalori masuk vs kalori keluar per tanggal) dalam rentang tanggal siklus tertentu. UI menampilkan daftar card per `progress_cycles` (sudah tersedia dari endpoint `GET /klien/progress-cycles` milik `feat/profil-onboarding-klien`); saat klien meng-expand salah satu card, Mobile melakukan **lazy load** ke endpoint baru `GET /klien/progress-cycles/:id/logs` untuk mengambil detail log harian siklus tersebut — bukan fetch semua log semua siklus sekaligus.

Fitur ini murni **read-only** dan **tidak melibatkan AI**. Seluruh data (kalori terbakar dan kalori masuk) sudah tersimpan sebagai snapshot di `activity_logs` dan `meal_logs` saat insert — endpoint ini hanya melakukan agregasi `SUM` per tanggal, tanpa kalkulasi ulang rumus MET atau kalori_per_100g.

---

## Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /klien/progress-cycles/:id/logs` | Klien | Daily log (kalori masuk vs kalori keluar) per tanggal dalam rentang siklus tertentu, lazy-loaded saat card di-expand |

> **Endpoint yang TIDAK diimplementasikan di sini:**
> `GET /klien/progress-cycles` (list semua siklus / daftar card) — **sudah ada** dari `feat/profil-onboarding-klien`. Cukup dirujuk sebagai dependency, jangan definisikan ulang.

---

## Business Rules

1. **Ownership Check (Wajib)**

   - Ambil `progress_cycles` by `:id` dari URL.
   - Validasi bahwa `progress_cycles.klien_id` **sama dengan** `req.user.id` (klien yang sedang login).
   - Jika cycle dengan ID tsb tidak ditemukan, **ATAU** ditemukan tapi **bukan milik klien** yang sedang login → kembalikan response yang **identik** yaitu HTTP 404 `"Siklus tidak ditemukan"`. Ini mencegah klien A membedakan "ID tidak ada" dengan "ID milik orang lain" sehingga tidak membocorkan informasi kepemilikan (sesuai standar OWASP dan checklist `jwt-auth-security`).

2. **Rentang Tanggal Query**

   - Log diambil dari `activity_logs` dan `meal_logs` yang `tanggal`-nya berada dalam rentang:
     - **Batas awal**: `progress_cycles.tanggal_mulai`
     - **Batas akhir**: `progress_cycles.tanggal_selesai` jika cycle sudah berstatus `selesai` (tanggal_selesai terisi), **atau** tanggal hari ini (`CURRENT_DATE()` / `new Date().toISOString().slice(0, 10)`) jika cycle masih `aktif` (`tanggal_selesai = null`).
   - Alasan: cycle aktif belum punya tanggal penutupan definitif, tapi klien tetap bisa lihat log yang sudah ada sampai hari ini.

3. **Agregasi per Tanggal (Penggabungan `activity_logs` + `meal_logs`)**

   - Karena **tidak ada FK** dari `activity_logs`/`meal_logs` ke `progress_cycles`, query berbasis rentang tanggal (bukan JOIN ke `progress_cycles`).
   - Untuk setiap tanggal dalam rentang, hitung:
     - `kaloriMasuk`: `SUM(meal_logs.kalori_masuk)` pada tanggal tsb untuk klien ini. Jika tidak ada meal log → `0`.
     - `kaloriKeluar`: `SUM(activity_logs.kalori_terbakar)` pada tanggal tsb untuk klien ini. Jika tidak ada activity log → `0`.
   - `kalori_terbakar` dan `kalori_masuk` adalah **nilai snapshot** yang sudah dihitung dan disimpan saat insert (oleh endpoint `POST /klien/activity-logs` dan `POST /klien/meal-logs`). **Jangan hitung ulang** pakai rumus MET atau kalori_per_100g — cukup SUM kolom yang sudah ada.

4. **Lazy Load — Per Card, Bukan Batch**

   - Endpoint ini dipanggil **per satu cycle** (saat klien expand card di UI). Mobile App **tidak boleh** fetch log untuk semua cycle sekaligus.
   - Ini adalah keputusan desain yang eksplisit dari `Bugarin_PRD_Mobile.md` bab 3.6: _"GET /klien/progress-cycles/:id/logs (detail per cycle saat di-expand — lazy load, jangan fetch semua sekaligus)"_.

5. **Read-Only, Tanpa Side-Effect**

   - Endpoint ini murni GET. Tidak mengubah data apapun — tidak update status cycle, tidak trigger AI, tidak insert log baru.

6. **Tidak Butuh AI**

   - Dikonfirmasi: seluruh data sudah ada di database sebagai snapshot. Tidak ada panggilan ke Gemini API.

## Keputusan Desain (Open Questions / Gaps)

- **[KEPUTUSAN FINAL] Tanggal Tanpa Log — Hanya Tanggal yang Punya Log (Opsi A)**
  Dalam rentang tanggal siklus, mungkin ada hari-hari di mana klien tidak mencatat olahraga maupun makanan sama sekali. **Keputusan**: hanya tanggal yang memiliki setidaknya 1 entry `activity_logs` atau `meal_logs` yang muncul di response array `data`. Tanggal kosong **di-skip**, tidak perlu ditampilkan dengan `kaloriMasuk: 0, kaloriKeluar: 0`.
  - Alasan: lebih hemat bandwidth, dan UI riwayat (card expand) menampilkan list log per hari yang ada, bukan kalender grid yang harus penuh. Jika UI berubah ke bentuk kalender/grid di kemudian hari, bisa ditinjau ulang.

- **[OPEN QUESTION] Pagination untuk Cycle Durasi Panjang?**
  Siklus dengan durasi 180+ hari bisa menghasilkan banyak row log. Apakah perlu pagination (limit/offset atau cursor)?
  - **Analisis**: Untuk skala PBL, durasi realistis siklus klien biasanya 30–90 hari. Bahkan jika 180 hari dengan semua hari terisi (worst case ~180 row), payload JSON-nya masih kecil (< 10 KB). Database query juga cepat karena sudah ada composite index `(klien_id, tanggal)` di kedua tabel log.
  - **Menunggu konfirmasi lanjut sebelum implementasi** — kalau belum ada keputusan final saat mulai coding, default-nya **TIDAK pakai pagination dulu** (sesuai analisis di atas), tapi ini harus dikonfirmasi ulang, bukan diasumsikan sepihak.

---

## Skema Data yang Dipakai (Tidak Ada Perubahan Schema)

Semua tabel sudah ada. **Tidak ada migration baru** yang diperlukan.

```
progress_cycles    (sudah ada, read-only di fitur ini)
  id               INT PK
  klien_id         FK → klien_profiles.id     [INDEX composite (klien_id, status)]
  tanggal_mulai    DATE NOT NULL
  tanggal_selesai  DATE nullable              ← null jika cycle masih aktif
  status           ENUM('aktif','selesai')

activity_logs      (sudah ada, read-only di fitur ini)
  klien_id         FK → klien_profiles.id     [INDEX composite (klien_id, tanggal)]
  kalori_terbakar  INT NOT NULL               ← snapshot, JANGAN hitung ulang
  tanggal          DATE NOT NULL

meal_logs          (sudah ada, read-only di fitur ini)
  klien_id         FK → klien_profiles.id     [INDEX composite (klien_id, tanggal)]
  kalori_masuk     INT NOT NULL               ← snapshot, JANGAN hitung ulang
  tanggal          DATE NOT NULL
```

> **Catatan penting**: Tidak ada FK dari `activity_logs`/`meal_logs` ke `progress_cycles`. Pengelompokan log ke dalam siklus dilakukan murni via rentang tanggal (`WHERE tanggal BETWEEN tanggal_mulai AND tanggal_selesai_atau_now`), sesuai desain ERD.

---

## Response Shape (sesuai skill `api-contract-bugarin`)

```typescript
// GET /klien/progress-cycles/:id/logs
// HTTP 200
// { data: DailyLogItem[], meta: { total: number } }

type DailyLogItem = {
  tanggal: string;       // format YYYY-MM-DD
  kaloriMasuk: number;   // SUM(meal_logs.kalori_masuk) pada tanggal ini, 0 jika tidak ada log meal
  kaloriKeluar: number;  // SUM(activity_logs.kalori_terbakar) pada tanggal ini, 0 jika tidak ada log activity
};
```

> **Penjelasan field di `meta`:**
> - `total`: jumlah elemen di array `data` — konsisten dengan pola list di `api-contract-bugarin`.

> **Yang TIDAK disertakan** (sesuai constraint "jangan kirim ulang data yang sudah dimiliki UI"):
> - `cycleId` — redundan, sudah ada di URL path `:id` yang dipakai untuk request.
> - `tanggalMulai` / `tanggalAkhir` — redundan, sudah tersedia dari response `GET /klien/progress-cycles` yang lebih dulu di-fetch UI untuk render list card.
> - Detail per-item log (nama olahraga, nama makanan, durasi, porsi) — UI Riwayat di `Bugarin_PRD_Mobile.md` bab 3.6 hanya menampilkan "tanggal, kalori masuk, kalori keluar" per hari, bukan breakdown per-item.
> - Data profil cycle (BB awal, BB tujuan, tujuan, durasi) — sudah tersedia dari response `GET /klien/progress-cycles`, tidak perlu dikirim ulang di sini.

---

## Validasi (Zod)

Tidak dibutuhkan request body — endpoint ini GET. Validasi dibatasi pada:

```
Path param (req.params):
  id → z.coerce.number().int().positive()

Auth:
  authGuard(["klien"])             ← identitas klien dari req.user.id
```

> **Catatan**: Parsing dan validasi `:id` dari `req.params` **wajib** menggunakan Zod `coerce`, konsisten dengan pola validasi di fitur-fitur lain.

---

## File yang Akan Dibuat/Diubah

```
src/modules/klien/
  klien.routes.ts         [MODIFY] — tambah GET /progress-cycles/:id/logs
  klien.controller.ts     [MODIFY] — tambah handler getCycleLogs
  klien.service.ts        [MODIFY] — tambah business logic getCycleLogs
                            (ownership check, resolve rentang tanggal,
                             agregasi SUM per tanggal dari activity_logs + meal_logs)
```

> Tidak ada Zod schema baru di `klien.schema.ts` karena endpoint ini tidak punya request body. Parsing path param dilakukan di controller.

---

## Urutan Implementasi

1. `klien.service.ts` — tambah `getCycleLogs(klienId: number, cycleId: number)`:
   - Ambil `progress_cycles` by `cycleId` → 404 jika tidak ada
   - Cek `klien_id` === `klienId` → 403 jika bukan milik klien
   - Tentukan batas akhir: `tanggal_selesai` jika ada, atau `CURRENT_DATE()` jika null
   - Query `activity_logs`: `SELECT tanggal, SUM(kalori_terbakar) AS kaloriKeluar FROM activity_logs WHERE klien_id = :klienId AND tanggal BETWEEN :mulai AND :akhir GROUP BY tanggal`
   - Query `meal_logs`: `SELECT tanggal, SUM(kalori_masuk) AS kaloriMasuk FROM meal_logs WHERE klien_id = :klienId AND tanggal BETWEEN :mulai AND :akhir GROUP BY tanggal`
   - Merge kedua hasil query by tanggal menjadi satu array `DailyLogItem[]`, isi `0` untuk field yang tidak punya data di tanggal tertentu
   - Sort array by tanggal ascending
   - Return `{ data, meta: { total: data.length } }`
2. `klien.controller.ts` — handler `getCycleLogs`: parse dan validasi `req.params.id` menggunakan Zod coerce, panggil service, return response
3. `klien.routes.ts` — `router.get('/progress-cycles/:id/logs', authGuard(['klien']), asyncHandler(getCycleLogs))`
4. Manual test via Postman untuk semua edge cases di tabel di bawah

---

## Dependency ke Fitur Lain

| Dependency | Arah | Keterangan |
|---|---|---|
| `feat/profil-onboarding-klien` | **Bergantung ke sini** | Endpoint `GET /klien/progress-cycles` (list card siklus) **sudah ada** dari branch ini. Fitur Riwayat menggunakannya untuk menampilkan daftar card — endpoint ini **tidak diimplementasikan ulang**. Juga bergantung pada `POST /klien/progress-cycles` untuk pembuatan cycle pertama (tanpa cycle, tidak ada log yang bisa ditampilkan). |
| `feat/progres-klien` | **Fitur lain menyediakan data** | Endpoint `POST /klien/activity-logs` dan `POST /klien/meal-logs` dari fitur Progres adalah sumber insert data log. Tanpa log yang pernah di-insert, `getCycleLogs` akan selalu return array kosong. `kalori_terbakar` dan `kalori_masuk` sudah berupa snapshot — fitur ini hanya SUM, tidak hitung ulang. |
| `feat/dashboard-klien` | **Tidak terkait langsung** | Dashboard dan Riwayat mengakses tabel yang sama (`activity_logs`, `meal_logs`) tapi untuk tujuan berbeda (streak vs daily log per cycle). Tidak ada saling ketergantungan implementasi. |

---

## Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| `:id` di URL bukan angka valid (NaN, string, negatif) | HTTP 400 (Zod Error Validation) |
| Cycle dengan `:id` tidak ditemukan di `progress_cycles` | HTTP 404 `"Siklus tidak ditemukan"` |
| Cycle ditemukan tapi `klien_id` tidak sama dengan klien yang login | HTTP 404 `"Siklus tidak ditemukan"` — response harus identik dengan kasus tidak ditemukan agar tidak membocorkan eksistensi data klien lain |
| Cycle berstatus `aktif` (tanggal_selesai = null) | Gunakan tanggal hari ini sebagai batas akhir rentang query |
| Cycle berstatus `selesai` (tanggal_selesai terisi) | Gunakan `tanggal_selesai` sebagai batas akhir rentang query |
| Rentang tanggal cycle valid tapi tidak ada log sama sekali (klien belum pernah catat apapun dalam cycle ini) | `data: []`, `meta.total: 0` — array kosong, bukan error |
| Suatu tanggal hanya punya activity log tapi tidak ada meal log | `kaloriMasuk: 0`, `kaloriKeluar: <SUM activity>` — field yang tidak ada di-default 0 |
| Suatu tanggal hanya punya meal log tapi tidak ada activity log | `kaloriMasuk: <SUM meal>`, `kaloriKeluar: 0` |
| Cycle dengan durasi sangat panjang (180+ hari) | Tetap return semua log dalam 1 response (tanpa pagination untuk MVP — lihat Open Question) |

---

## Definition of Done

- [ ] Endpoint `GET /klien/progress-cycles/:id/logs` terimplementasi sesuai layering `express-typescript-patterns` (routes → controller → service)
- [ ] Ownership check memastikan klien hanya bisa akses log dari cycle miliknya sendiri (mereturn 404 identik dengan kasus not found jika ownership gagal)
- [ ] Cycle aktif (`tanggal_selesai = null`) menggunakan tanggal hari ini sebagai batas akhir rentang
- [ ] `kalori_terbakar` dan `kalori_masuk` **tidak dihitung ulang** — hanya `SUM` dari snapshot yang sudah tersimpan
- [ ] Tidak ada panggilan AI / Gemini API di endpoint ini
- [ ] Response mengikuti envelope `{ data, meta }` sesuai `api-contract-bugarin`
- [ ] Open Question pagination sudah dikonfirmasi sebelum coding dimulai (default: tanpa pagination, tapi perlu konfirmasi eksplisit — lihat Keputusan Desain)
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` lolos tanpa error
- [ ] Manual test via Postman untuk **semua edge cases** di tabel di atas (termasuk: ownership fail, cycle aktif vs selesai, tanggal tanpa log)
- [ ] Work Result ditulis di PR sesuai format `WORKFLOW.md` bab 5
