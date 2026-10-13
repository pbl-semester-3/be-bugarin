# PRD Fitur: Dashboard PT

## Metadata

| | |
|---|---|
| **Role** | Personal Trainer (PT) |
| **Branch** | `feat/dashboard-pt` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.2 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.2 (Fitur Web PT — baris "Dashboard")
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.2 (kontrak endpoint PT — `GET /pt/dashboard-summary`)
- `docs/Bugarin_PRD_Frontend.md` bab 4.1 (spesifikasi tampilan `/pt/dashboard`)
- `docs/bugarin_schema_notes.md` bab 4 (Weekly Plan AI — status lifecycle)
- `docs/bugarin_erd.mermaid` — relasi `klien_profiles.pt_id` ke `pt_profiles`
- `fitur/klien/PRD-dashboard-klien.md` (pola agregat read-only)
- `fitur/klien/PRD-pt-ku-klien.md` (dependency: PT harus punya `tempat_gym` sebelum bisa di-pairing)

## Ringkasan

Fitur Dashboard PT menyediakan satu endpoint agregat (`GET /pt/dashboard-summary`) yang bersifat murni *read-only*. Endpoint ini menyuplai data untuk halaman beranda Web PT, meliputi: (1) Jumlah klien aktif yang dibimbing oleh PT tersebut, dan (2) Jadwal latihan gabungan minggu ini dari seluruh klien yang jadwalnya telah dikonfirmasi, lengkap dengan nama klien, waktu, jenis latihan, serta lokasi gym.

Tidak ada proses mutasi data, pemanggilan AI, maupun pembuatan tabel baru di fitur ini.

---

## Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /pt/dashboard-summary` | PT | Mengambil agregat data ringkasan dashboard PT: jumlah klien aktif dan *flat list* jadwal latihan minggu ini dari seluruh klien. |

---

## Business Rules

1. **Jumlah Klien Aktif**
   - Diambil dari jumlah *row* (COUNT) pada tabel `klien_profiles` di mana field `pt_id` sama dengan `pt_profiles.id` milik PT yang login (resolve `pt_profiles.id` dari `req.user.id` terlebih dahulu — `users.id` dan `pt_profiles.id` tidak dijamin sama).
   - **Definisi "Aktif"**: Murni diartikan sebagai "klien yang sudah di-pairing dengan PT ini". Klien tetap dihitung aktif meskipun mereka belum memiliki `progress_cycles` yang sedang berjalan atau `weekly_plans`. Sebagai PT, mereka perlu memonitor semua klien yang menjadi tanggung jawabnya (termasuk klien baru yang belum memulai progres).

2. **Filter Status Weekly Plan untuk Jadwal Gabungan**
   - Jadwal yang diekstrak dan digabungkan **hanya** plan dari `weekly_plans` yang memiliki status `disetujui` atau `override`.
   - **Alasan Bisnis**: Dashboard Web PT berfungsi sebagai representasi "jadwal nyata yang sedang berjalan minggu ini" agar PT bisa mengantisipasi di mana dan jam berapa mereka harus bekerja mendampingi klien. Plan yang masih berstatus `pending_review` belum disetujui secara formal, sehingga bukan merupakan komitmen waktu yang valid. (Fungsi meninjau dan meng-approve plan *pending_review* adalah kebutuhan spesifik yang akan ditempatkan di halaman "Klien Detail", bukan di Dashboard agregat ini).

3. **Struktur Agregasi Jadwal Latihan**
   - Diekstrak dari field JSON `workout_plan` pada record `weekly_plans` milik klien PT.
   - **Definisi "Minggu Berjalan"**: Tabel `weekly_plans` memiliki field `minggu_mulai` (bertipe `DATE`). Karena plan satu klien di-generate terus setiap minggu, klien akan memiliki banyak baris historis. Untuk mengambil jadwal minggu ini, query memakai **exact-match Senin UTC**: `minggu_mulai = getStartOfWeekUtc()` (lihat `src/utils/week.ts`), lalu ambil **1 baris terbaru** bila ada duplikat (`ORDER BY generated_at DESC`).
   - **Justifikasi Pendekatan**: Disamakan dengan sisi Klien dan cron (revisi 2026-10-03). Sebelumnya memakai "baris terbaru `minggu_mulai <= CURRENT_DATE`", namun itu tidak konsisten dengan reader klien yang exact-match Senin. Konsekuensi yang diterima: bila plan minggu ini belum ter-generate, jadwal tidak muncul (bukan mengambil plan minggu lalu).
   - **Struktur Flat List**: Jadwal **TIDAK** dikelompokkan (nested) per klien. Semua item olahraga dari seluruh klien digabungkan dan diratakan (flatten) menjadi satu array (daftar baris), di mana setiap baris mewakili 1 sesi olahraga (mengandung `klienId`, `namaKlien`, `hari`, `jam`, `jenis`, `lokasi`).
   - Jadwal harus diurutkan secara kronologis hari dalam seminggu (Senin hingga Minggu), lalu berdasarkan jam.

4. **Lokasi Gym yang Seragam**
   - Seluruh klien yang ditangani oleh PT tersebut otomatis akan berlatih di lokasi gym PT.
   - Field `lokasi` pada setiap item latihan tidak diambil dari data JSON weekly plan, melainkan disuntikkan (*injected*) dari field `tempat_gym` milik tabel `pt_profiles` (untuk `id` = PT yang login) saat respons dibentuk.

5. **Klien Tanpa Jadwal Minggu Ini**
   - Jika ada klien yang telah ter-pairing (terhitung di `jumlahKlienAktif`) namun belum memiliki plan minggu ini, atau plan-nya masih `pending_review`, maka baris jadwal untuk klien tersebut tidak akan muncul sama sekali di tabel jadwal gabungan. Hal ini valid dan diizinkan.

---

## Skema Data yang Dipakai

Tidak ada perubahan skema database atau penambahan tabel.
Melibatkan data dari:
- `pt_profiles` (`id`, `tempat_gym`)
- `klien_profiles` (`id`, `nama`, `pt_id`)
- `weekly_plans` (filter `minggu_mulai` untuk mendapat minggu berjalan, dan status `disetujui` / `override`)

---

## Response Shape

```typescript
// GET /pt/dashboard-summary
// HTTP 200
// { data: DashboardSummaryPT }

type DashboardSummaryPT = {
  jumlahKlienAktif: number;
  jadwalLatihan: JadwalLatihanItem[];
};

type JadwalLatihanItem = {
  klienId: number;    // ID klien untuk kemudahan link/navigasi di frontend
  namaKlien: string;  // Berasal dari klien_profiles.nama
  hari: string;
  jam: string;
  jenis: string;
  lokasi: string;     // Berasal dari pt_profiles.tempat_gym
};
```

---

## Validasi (Zod)

Tidak ada validasi parameter input/body karena ini endpoint GET agregat murni. Autentikasi sepenuhnya diatur via middleware.

**GET `/pt/dashboard-summary`**
```
Auth:
  authGuard(["pt"])
```

---

## File yang Akan Dibuat/Diubah

```
src/modules/pt/
  pt.routes.ts         [MODIFY] — tambah route GET /dashboard-summary
  pt.controller.ts     [MODIFY] — tambah handler getDashboardSummary
  pt.service.ts        [MODIFY] — tambah fungsi getDashboardSummaryPT() berisi logic agregat dan flatten JSON workout
```

---

## Urutan Implementasi

1. **Service (`pt.service.ts`)**:
   - Hitung jumlah `klien_profiles` yang field `pt_id`-nya sama dengan `pt_profiles.id` milik PT login (resolve `pt_profiles.id` dari `req.user.id` terlebih dahulu).
   - Ambil profil PT saat ini untuk mendapatkan data `tempat_gym`.
   - Lakukan JOIN dari `klien_profiles` (milik PT ini) ke `weekly_plans` untuk mengambil plan minggu berjalan menggunakan exact-match Senin UTC (`minggu_mulai = getStartOfWeekUtc()`, `ORDER BY generated_at DESC` bila duplikat) DAN pastikan `status IN ('disetujui', 'override')`.
   - Loop dan *flatten* isi kolom JSON `workout_plan` dari hasil query, sematkan `nama` klien dari row tersebut, dan sematkan `tempat_gym` ke setiap item.
   - **Sorting Hari (Wajib di level Aplikasi)**: Array hasil flatten harus diurutkan hari dan jamnya. Lakukan *sorting* index array secara eksplisit menggunakan referensi (misalnya konstan `['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']`) agar hasilnya benar secara kronologis. Jangan gunakan *string order* bawaan database/JS karena "Jumat" akan muncul sebelum "Kamis" secara alfabet.
2. **Controller (`pt.controller.ts`)**:
   - Panggil fungsi di service, balut dalam format envelope Bugarin (`{ data: ... }`), dan kembalikan dengan status 200.
3. **Routes (`pt.routes.ts`)**:
   - Daftarkan path dan terapkan `authGuard(["pt"])`.
4. Lakukan pengecekan manual dengan 2-3 klien dummy.

---

## Dependency ke Fitur Lain

| Dependency | Arah | Keterangan |
|---|---|---|
| `feat/profil-pt` | **Bergantung ke sini** | Menurut PRD PT-ku Klien, PT baru bisa menerima *pairing* kalau field `tempat_gym` sudah diisi. Jika fitur profil PT belum selesai, `tempat_gym` mungkin kosong dan data simulasi perlu di-seed manual untuk keperluan testing dashboard ini. |
| `feat/klien-detail-pt` | **Fitur lain terpisah** | Fungsi untuk PT melakukan *review/approve* terhadap weekly plan bersatus `pending_review` dikerjakan secara terpisah pada fitur halaman detail Klien (belum disusun PRD-nya). |

---

## Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| PT belum memiliki klien sama sekali (belum ada yang di-pairing) | `jumlahKlienAktif: 0`, `jadwalLatihan: []` (TIDAK ERROR 404). |
| Klien PT ada, tapi tidak satupun yang punya weekly plan disetujui minggu ini | `jumlahKlienAktif: X`, `jadwalLatihan: []`. |
| Field `tempat_gym` PT kosong (misal data kotor/bypass sistem) | `lokasi: "-"` (placeholder, jangan biarkan melempar error *null pointer* saat menyisipkan nilai lokasi ke jadwal). |
| Salah satu plan klien masih `pending_review` | Jadwal tersebut tidak dimuat di array `jadwalLatihan`. |

---

## Definition of Done

- [ ] Fungsi endpoint `GET /pt/dashboard-summary` dapat diakses dan dilindungi oleh otorisasi role `pt`.
- [ ] Menghitung seluruh jumlah klien aktif dengan benar berlandaskan referensi `pt_id`.
- [ ] Penguraian (`flatten`) data JSON `workout_plan` ke dalam sebuah *flat array* berjalan sempurna dengan penyertaan nama klien dan lokasi PT.
- [ ] Weekly plan yang statusnya masih `pending_review` berhasil disaring agar TIDAK muncul di daftar jadwal latihan dashboard ini.
- [ ] Tidak terjadi crash saat data PT tidak memiliki field `tempat_gym` yang sah.
- [ ] Work Result terisi sesuai format `WORKFLOW.md`.
