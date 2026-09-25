# PRD Fitur: Riwayat Klien PT

## Metadata

| | |
|---|---|
| **Role** | Personal Trainer (PT) |
| **Branch** | `feat/riwayat-pt` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.2 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.2 (Fitur Web PT — baris "Riwayat": list ringkas seluruh klien — nama, usia, gender, BB awal-sekarang)
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.2 (kontrak endpoint PT — GET /pt/riwayat)
- `docs/Bugarin_PRD_Frontend.md` bab 4.4 (spesifikasi UI riwayat read-only tanpa aksi)
- `docs/bugarin_schema_notes.md` bab 3 (Lifecycle target BB dan sumber BB Sekarang dari `weight_logs`)
- `docs/bugarin_erd.mermaid` (Tabel `klien_profiles`, `progress_cycles`, `weight_logs`)
- `fitur/pt/PRD-klien-detail-pt.md` (PENTING: batasan tujuan antara endpoint Klien Detail vs Riwayat)
- `fitur/pt/PRD-dashboard-pt.md` (Pola klien aktif `pt_id = PT login`)

## Ringkasan

Fitur ini menyediakan halaman agregasi (laporan) *read-only* bagi Personal Trainer untuk melihat gambaran progres seluruh klien mereka dalam satu layar. Berbeda dengan menu *Klien* yang difokuskan pada navigasi detail dan *review* jadwal mingguan, menu *Riwayat* ini secara eksklusif menyajikan ringkasan transformasi historis klien secara demografis dan absolut (usia, gender, dan perbandingan berat badan awal vs sekarang) tanpa adanya interaksi atau tautan mendalam.

---

## Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /pt/riwayat` | PT | Mengambil list agregat seluruh klien aktif PT beserta profil dasar (usia, gender) dan indikator keberhasilan absolut (BB awal dan BB sekarang). |

---

## Business Rules

1. **Pemisahan Tujuan yang Tegas (vs `GET /pt/klien`)**
   - Mengapa sistem Bugarin memiliki dua endpoint "list klien"? Hal ini dikarenakan tujuannya sangat berbeda:
     - `GET /pt/klien` (*PRD Klien Detail PT*): Merupakan endpoint navigasional *ultra-light* (hanya `id` dan `nama`) untuk me-render list/tabel secara cepat di panel, demi mencari nama klien yang hendak di-*review* Weekly Plan AI-nya.
     - `GET /pt/riwayat` (*PRD ini*): Merupakan laporan komprehensif *read-only*. Endpoint ini memikul komputasi gabungan (menggabungkan data `klien_profiles`, `progress_cycles`, dan `weight_logs`) demi menghasilkan ringkasan perbandingan transformasi demografi (`usia`, `gender`) serta pencapaian statis (`bb_awal` vs `bb_sekarang`).
   - Sesuai dengan spesifikasi Frontend, daftar ini disajikan statis tanpa aksi *click-through* atau interaksi di-UI-nya.

2. **Resolusi "BB Sekarang" (Berbasis Histori Log)**
   - Seperti prinsip absolut aplikasi ini, *BB Sekarang* **bukan** berasal dari kolom statis manapun, melainkan harus selalu ditarik dari *entry* **TERAKHIR** milik klien yang bersangkutan di tabel `weight_logs`.
   - Logika penarikan: Cari rekaman `weight_logs` klien dengan `tanggal` paling baru (DESC LIMIT 1).

3. **Proteksi Badai Query (Mencegah N+1 Problem)**
   - Karena endpoint ini menghasilkan banyak baris (puluhan klien sekaligus), developer **DILARANG KERAS** memanggil fungsi pencarian log berat badan per-klien di dalam iterasi *looping array* (`await db.select().where...`).
   - Validasi data harus diselesaikan dengan metode aglomerasi di Service, seperti: eksekusi *Window Function SQL* (`ROW_NUMBER() OVER(PARTITION BY klien_id ORDER BY tanggal DESC)`), memanfaatkan *LEFT JOIN* dengan *subquery* maksimal tanggal, atau sekadar me-load log relevan ke dalam RAM (*memory-level manipulation* via JS) secara *batching* `IN (...)`.

4. **[KEPUTUSAN FINAL] Non-Pagination & Default Sorting**
   - **Pagination**: Untuk skala studi proyek akhir (PBL) di mana perkiraan batas klien satu PT sangat logis dirender serentak (di bawah 100), implementasi fitur *pagination* adalah *over-engineering* yang tidak perlu. Semua data dikirim utuh dalam satu balasan.
   - **Sorting**: Secara alami dari Service, klien akan dikembalikan dengan deretan abjad berdasarkan `nama ASC`. 

5. **[KEPUTUSAN FINAL] "BB Awal" Merujuk pada Siklus Pertama (Tertua)**
   - **Konteks Masalah**: Mengingat klien memiliki banyak perjalanan diet (banyak baris pada `progress_cycles` karena berhasil menyelesaikan siklus target sebelumnya lalu beralih ke target baru), kolom manakah yang sah dicatut sebagai patokan "BB Awal" dalam laporan Riwayat ini?
   - **Analisis (Opsi A vs B)**: Halaman "Riwayat" PT difungsikan sebagai trofi pencapaian PT atas sejauh mana mereka mengawal transformasi klien selama bergabung. Mengambil dari siklus terbaru tidak mewakilkan kerja keras transformatif tersebut, karena hanya menunjukkan posisi klien dalam 3-4 minggu terakhir saja. Sedangkan mengambil dari siklus pertama kali mendaftar secara gamblang melukiskan titik nol absolut dari progres klien (sebagai contoh, 100kg ke 75kg dalam setahun).
   - **Keputusan Final**: Implementasi menggunakan **Siklus Pertama/Tertua**. *BB Awal* di menu riwayat harus secara konsisten menarik `bb_awal_kg` dari `progress_cycles` yang memiliki umur terlama per klien.

---

## Skema Data yang Dipakai

Tidak ada perubahan skema database. Semua merupakan operasi ekstraksi (*SELECT/JOIN*):
- `klien_profiles` (`id`, `nama`, `usia`, `jenis_kelamin`, `pt_id`)
- `progress_cycles` (`klien_id`, `bb_awal_kg`, `tanggal_mulai`)
- `weight_logs` (`klien_id`, `berat_badan_kg`, `tanggal`)

---

## Response Shape

```typescript
// GET /pt/riwayat
// HTTP 200
type RiwayatPtResponse = {
  data: RiwayatKlienItem[];
  meta: {
    total: number;
  };
}

type RiwayatKlienItem = {
  id: number;
  nama: string;
  usia: number | null;
  jenisKelamin: "pria" | "wanita" | null;
  bbAwalKg: number | null;
  bbSekarangKg: number | null;
}
```

---

## Validasi (Zod)

- Hanya diamankan di gerbang API dengan Role PT: `authGuard(["pt"])`.
- Tidak ada kebutuhan Zod skema untuk *body* (berhubung ini endpoint *fetch-all GET* parameter-less).

---

## File yang Akan Dibuat/Diubah

```
src/modules/pt/
  pt.routes.ts         [MODIFY] — mendaftarkan endpoint GET /riwayat
  pt.controller.ts     [MODIFY] — menambah handler getRiwayatPT
  pt.service.ts        [MODIFY] — membubuhkan logic data extraction khusus getRiwayatPT() 
```

---

## Urutan Implementasi

1. **Service (`pt.service.ts`) - Ambil Klien Dasar**:
   - Tarik query `klien_profiles` (SELECT id, nama, usia, jenis_kelamin) yang difilter oleh identitas pelatih `pt_id === req.user.id`. Urutkan berdasar alfabet `nama ASC`. 
   - Bila data tiada/kosong, hentikan aliran dan kirimkan murni `data: []` ke Frontend.
2. **Service - Tarik Batch Data BB (Anti N+1)**:
   - Buat variabel list `id` gabungan klien.
   - **Tarik BB Awal (Siklus Pertama)**: Query ke `progress_cycles` menggunakan *filter batch* `klien_id IN (...)`. **WAJIB** menghindari *looping* per klien; gunakan pola aglomerasi SQL, misalnya *Window Function* `ROW_NUMBER() OVER(PARTITION BY klien_id ORDER BY tanggal_mulai ASC)`, atau *subquery* `MIN(tanggal_mulai)` diiringi `GROUP BY klien_id`, untuk mengambil baris siklus paling pertama.
   - **Tarik BB Sekarang (Log Terakhir)**: Query ke `weight_logs` menggunakan `klien_id IN (...)`. Terapkan metode ekivalen *Window Function* (`ROW_NUMBER() OVER(PARTITION BY klien_id ORDER BY tanggal DESC)`) atau manipulasi *in-memory* grouping.
3. **Service - Pemetaan Bersama (Mapping)**:
   - Rakit hasil-hasil terpisah tadi (via id *lookup map* untuk mempercepat kompleksitas perataan ke O(n)) dengan array Klien Dasar pada Step 1.
4. **Controller (`pt.controller.ts`)**:
   - Terima serah terima *flat-array* ini, bungkus dalam formasi API standar (`{ data: [...], meta: { total } }`), set instruksi `200 OK`.
5. **Routes (`pt.routes.ts`)**:
   - Expose tautan endpoint ini dengan proteksi Token Authorization PT yang selaras.

---

## Dependency ke Fitur Lain

| Dependency | Arah | Keterangan |
|---|---|---|
| `fitur/klien/PRD-profil-onboarding-klien.md` | **Pemasok Data** | Memproduksi demografi awal, rekaman perdana `progress_cycles` (untuk "BB Awal"), serta penyimpan rutinitas pembaruan histori `weight_logs` (penentu mutlak indikator "BB Sekarang"). |
| `fitur/klien/PRD-progres-klien.md` | **Pemasok Data** | Mengelola tambahan ekosistem log rutinitas aktivitas klien. |

---

## Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| PT sepi klien (belum ada klien _pairing_) | Mengembalikan HTTP 200 normal berupa payload `data: []` dan `meta: { total: 0 }`. Tidak *crash* 404. |
| Akun klien baru _paired_ (usia/gender belum terinput pasca registrasi) | Nilai string/number disuguhkan sebagai *primitive* `null`. Aplikasi Frontend yang akan merender _fallback_ strip (-). |
| Klien tidak memiliki BB Awal atau Log | Nilai `bbAwalKg` dan/atau `bbSekarangKg` di-supply transparan sebagai `null`. Tidak menimbulkan exception *null pointer*. |
| *Payload* komputasi rawan berat / *Timeout* | Diselamatkan lewat perancangan komputasi anti N+1 dengan menggunakan metode *Batching ID* (*`WHERE IN ...`*) dari lapisan arsitektur Service, sehingga server senantiasa responsif. |

---

## Definition of Done

- [ ] Route `GET /pt/riwayat` terangkai sempurna dengan *response array* utuh.
- [ ] Penjelasan pemisahan domain kerja (Navigasional ringan versus Laporan demografik berat) antara Endpoint Klien Detail dengan Riwayat telah dikonkretkan di Business Rule #1.
- [ ] Algoritma pengambilan BB Awal diputuskan murni mencerminkan target "*Siklus Pertama (Tertua)*" demi potret perjalanan transformasi yang panjang.
- [ ] Pengambilan BB Sekarang stabil diukur dari entry log *terakhir* (`weight_logs.tanggal DESC`).
- [ ] Ancaman fenomena bahaya "N+1 Problem" diberangus dan digaransi kebersihannya di tingkatan Service.
- [ ] Keberagaman data mentah/tidak langkap (banyak elemen *null* akibat _no-cycle/no-log_ milik klien anyar) tidak merepotkan perenderan data.
