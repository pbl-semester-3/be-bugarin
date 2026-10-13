# PRD Fitur: CRUD User Admin

## Metadata

| | |
|---|---|
| **Role** | Admin |
| **Branch** | `feat/crud-user-admin` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.3 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.3 (Web Admin — CRUD User) dan bab 4 (Peran Pengguna).
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.3 (kontrak endpoint Admin).
- `docs/bugarin_schema_notes.md` bab 1 (Users & Role) dan bab 9 (Admin Activity Log).
- `docs/bugarin_erd.mermaid` — tabel `users`, `klien_profiles`, `pt_profiles`, `admin_activity_logs`, `progress_cycles`, `pairing_requests`.
- `fitur/admin/PRD-dashboard-admin.md` — acuan gaya dan standar arsitektur fitur Admin.
- `fitur/pt/PRD-profil-pt.md` — pembagian tanggung jawab data (kolom spesifik PT dilengkapi mandiri setelah pembuatan).
- `skills/api-contract-bugarin/SKILL.md` — kewajiban *envelope* `{ data: ... }` dan *camelCase*.
- `skills/jwt-auth-security/SKILL.md` — penggunaan `authGuard(["admin"])` serta aturan perlakuan *password hashing* & generasi *password random*.

## Ringkasan

Fitur ini melengkapi Admin dengan wewenang sentral (CRUD) untuk mengelola seluruh entitas pengguna (Klien maupun Personal Trainer). Fungsi paling krusial di sini adalah kemutlakan kendali pembuatan akun PT; di mana PT tidak bisa mendaftar sendiri, melainkan harus diciptakan oleh Admin. Seluruh modifikasi data yang terjadi dalam ruang lingkup ini diwajibkan untuk senantiasa meninggalkan rekam jejak pada log audit (`admin_activity_logs`). 

## Endpoint

| Method & Path | Fungsi |
|---|---|
| `GET /admin/users?role=` | Mengambil daftar pengguna berdasarkan filter *role* (`klien` atau `pt`). |
| `POST /admin/users/pt` | Membuat akun Personal Trainer (PT) baru, langsung aktif tanpa registrasi mandiri/approval. |
| `PUT /admin/users/:id` | Mengubah (edit) data profil dari pengguna yang telah terdaftar. |
| `DELETE /admin/users/:id` | Menghapus akun pengguna dari platform (Klien atau PT). |

## Business Rules

1. **Pemilahan Pengambilan Data (`GET /admin/users`)**: 
   - *Query parameter* `role` mutlak dibutuhkan (`?role=klien` atau `?role=pt`). 
   - Apabila pencarian dilakukan untuk `role=klien`, respons akan menggabungkan *record* dari tabel `users` dan `klien_profiles`. Sebaliknya untuk `role=pt`, balasan dikawinkan dengan data `pt_profiles`.
2. **Keterbatasan Beban Admin (`POST /admin/users/pt`) — [REVISI 2026-10-10]**:
   - Admin menyuplai: `nama`, `email`, `username`, dan `password`. (Semuanya wajib).
   - **Distribusi insert ke tabel**: `email`, `username`, dan `password_hash` masuk ke tabel `users`; `nama` masuk ke tabel `pt_profiles` (kolom `nama` ada di tabel profile, bukan di `users` — sesuai ERD).
   - Fitur pendukung spesifik PT (`usia`, `jenisKelamin`, `spesialisasi`, `tempatGym`) SENGAJA dibiarkan *null* pada `pt_profiles` agar dilengkapi PT saat login pertama.
3. **Password Diketik Admin — [REVISI 2026-10-10]**:
   - Password di-*set* **manual oleh Admin** saat `POST` (bukan auto-generate). Backend WAJIB meng-*hash* (argon2) sebelum menyimpan ke `users.password_hash`.
   - **Tidak ada** `temporaryPassword` di response. Password plaintext tidak pernah dikembalikan/disimpan.
4. **Penanganan Integritas Data & Dangling References (`DELETE`) — [REVISI 2026-10-10] Soft-Delete Seragam**:
   - **Klien & PT sama-sama Soft-Delete**: `DELETE /admin/users/:id` **tidak** menghapus baris. Aksi = `users.is_active = false` (nonaktifkan). Data histori (progres, log, feedback, pairing) **tetap utuh** untuk audit.
   - **Lepas ikatan klien**: `UPDATE klien_profiles SET pt_id = NULL` — untuk PT yang dinonaktifkan (`WHERE pt_id = X`) maupun klien yang dinonaktifkan (`WHERE id = X`).
   - **Bersihkan request menggantung**: hapus `pairing_requests` berstatus `pending` milik PT/klien tersebut (riwayat `diterima`/`ditolak` tetap disimpan).
   - **Efek**: user nonaktif diblokir login, ditolak `authGuard`, dan hilang dari rekomendasi PT; klien nonaktif otomatis hilang dari daftar/dashboard PT karena `pt_id` di-null.
   - *Alasan revisi*: semula klien dirancang *hard-delete*; diubah ke *soft-delete* demi keamanan data & reversibilitas. Karena tidak ada penghapusan baris, **tidak diperlukan migrasi FK/cascade**.
5. **Kewajiban Log Audit**: Seluruh operasi yang menulis modifikasi (POST, PUT, DELETE) WAJIB dilangsungkan dalam satu gelembung **DB Transaction** yang menyatu (se-irama) dengan operasi `INSERT` ke tabel `admin_activity_logs`. Kolom aktivitas mendeskripsikan ringkasan tindak-tanduk, contoh: `"Admin membuat akun PT: Budi"` atau `"Admin menghapus Klien ID: 12"`.

## Keputusan Desain (Final)

- **[KEPUTUSAN FINAL] Shape Data `GET /admin/users?role=`**
  - **Konteks**: Bagaimana bentuk kembalian yang paling masuk akal mengingat skema profil *Klien* dan *PT* sangat jauh berbeda satu sama lain?
  - **Keputusan**: Tetap memakai satu bentuk standar *response array* yang memuat informasi global (seperti `id`, `nama`, `email`, `username`, `role`), kemudian menempatkan informasi eksklusif pada objek bawahan tersendiri yang diisi kondisional (misal objek `klienProfile` terisi dan `ptProfile` dikembalikan `null` jika perannya adalah klien).
  - **Alasan**: Lebih ramah terhadap pemeriksaan sistem tipe (*type-safety*) TypeScript di *Frontend*. Zod *schema* milik antarmuka bisa mendeduksi percabangan validasi secara logis dan *null eksplisit* mengurangi risiko galat membaca *undefined field*.

## Skema Data & Response Shape

### Deklarasi Migration Baru (Pengecualian)
Berbeda dari PRD terdahulu yang tidak mengubah skema tabel eksisting, keputusan menempuh rute *soft-delete* bagi PT memaksa kita untuk **menambahkan satu kolom penanda status baru** di *database*. Rencana ini menuntut *migration* mutlak sebelum pengembangan fitur dimulai:
- **Tabel Sasaran**: Tambahkan kolom `is_active BOOLEAN DEFAULT true` ke tabel `users`.
- **Alasan Penempatan Tabel**: Kolom penonaktifan ini ditanam di `users` (bukan di `pt_profiles`), karena `users` berfungsi sebagai tulang punggung basis autentikasi **semua role** (lihat *schema notes* bab 1). Andaikata esok hari konsep *soft-delete* diperluas ke _role_ lain seperti klien/admin, kolom pengaturnya sudah eksis sempurna di akar autentikasi tanpa harus mendesain migrasi tabel berulang kali.

### Kebijakan Visibilitas Akun Nonaktif (`GET /admin/users`)
**TETAP DITAMPILKAN:** Meski seorang PT telah di-*soft-delete* (`is_active = false`), ia akan **tetap muncul (tampil)** dalam balasan *array* API *listing* secara *default*. Ini memastikan Admin selaku pihak pengawas tidak pernah kehilangan *audit trail* rekam jejak pengguna. Admin cukup menyisihkan pemahaman statusnya dari atribut `isActive` yang dilampirkan API.

**Response `GET /admin/users?role=pt`**:
```json
{
  "data": [
    {
      "id": 15,
      "email": "pt.budi@bugarin.com",
      "username": "ptbudi",
      "role": "pt",
      "isActive": true,
      "klienProfile": null,
      "ptProfile": {
        "nama": "Budi Santoso",
        "usia": null,
        "jenisKelamin": null,
        "spesialisasi": null,
        "tempatGym": null
      }
    }
  ]
}
```

**Response `POST /admin/users/pt`**:
```json
{
  "data": {
    "id": 20,
    "email": "pt.baru@bugarin.com",
    "username": "ptbaru",
    "role": "pt",
    "ptProfile": { "nama": "Agus PT" }
  }
}
```
*(Password diketik Admin; tidak ada `temporaryPassword`.)*

> `klienProfile` pada `GET /admin/users?role=klien` juga menyertakan `tujuan: "turun_bb" | "naik_bb" | null` (dari `progress_cycles` siklus **aktif**, `null` bila belum ada).

## Validasi (Zod) & Autorisasi

Seluruh *endpoint* wajib diselubungi pelindung otorisasi mutlak `authGuard(["admin"])`.

```typescript
// GET /admin/users
getUsersQuerySchema: { 
  role: enum(['klien','pt']) 
}

// POST /admin/users/pt
createPtSchema: { 
  nama: string.min(1), 
  email: string.email(), 
  username: string.min(3).max(50),
  password: string.min(8)   // diketik Admin manual
}

// PUT /admin/users/:id  (target hanya klien/PT)
updateUserSchema: { 
  nama?: string.min(1),
  email?: string.email(),
  username?: string.min(3).max(50),
  password?: string.min(8)  // password baru (opsional) — menutup gap 6.6
  // nama → menyasar tabel profile role target (pt_profiles/klien_profiles)
  // email, username, password → menyasar tabel users
}
```

## File yang Akan Dibuat/Diubah

- `src/modules/admin/admin.routes.ts` `[MODIFY]` — Deklarasi penambahan rute CRUD baru berpayung *middleware* proteksi, mendampingi ekstensi rute sebelumnya (modul `admin/` sudah ada semenjak set-up).
- `src/modules/admin/admin.controller.ts` `[MODIFY]` — Mewadahi *handler* CRUD yang akan memvalidasi *parameter/query* dan melemparnya ke *service*, sekaligus menyelebungi kembalian dengan `{ data: ... }`.
- `src/modules/admin/admin.service.ts` `[MODIFY]` — Tempat implementasi eksekusi kueri agregat *join*, logika pembangkitan kata sandi acak `crypto`/`bcrypt`, operasi transaksi (*DB Transaction*), penanganan jejak `admin_activity_logs`, dan algoritma penyelamatan relasi *dangling* klien.
- `src/modules/admin/admin.schema.ts` `[MODIFY]` — Pendefinisian validasi kerangka rute berwujud modul Zod (kriteria format `role`, isian `email`, dsb).

## Urutan Implementasi

1. **Schema & Validasi**: Formulasi skema validasi Zod untuk argumen API (filter `role` pada *query* dan isi *body* kreasi/perubahan akun) pada `admin.schema.ts`.
2. **Service - Penemuan Pola Database**: Siapkan kode operasional di *service* untuk penggabungan (*join*) data universal tabel `users` dengan tabel profil turunannya yang mematuhi bentuk kembalian (*response shape*).
3. **Service - Pembuatan Akun Ekstra Aman**: Implementasikan algoritma pencipta _password_ secara _random_, hash, serta pembungkusan mutlak satu irama transaksi dengan penyetoran pencatatan riwayat di `admin_activity_logs`.
4. **Service - Hapus dan Lepas Simpul Klien**: Kerjakan algoritma penumbangan data: eksekusi *hard-delete* (perintah SQL `DELETE` sungguhan dengan efek *cascade*) bila sasarannya Klien; namun, bila sasarannya PT, eksekusi ini secara teknis adalah kueri `UPDATE users SET is_active = false WHERE id = X`, disusul `UPDATE klien_profiles SET pt_id = NULL WHERE pt_id = X` untuk menyelamatkan klien-klien yang bersangkutan.
5. **Controller & Routes**: Rajut setiap utas servis tersebut ke _controller_ untuk dilayani via rute `admin.routes.ts` di balik _authGuard(["admin"])_.

## Dependency ke Fitur Lain (Dampak Kolom Baru `is_active`)

Kehadiran kolom *soft-delete* (`is_active`) menciptakan efek domino lintas-modul yang **WAJIB dicatat dan dikoordinasikan** bersama tim terkait, meski pekerjaannya mungkin berada di luar cakupan murni koding PR Admin ini:

- **Modul `auth/` (Login & Autentikasi)**: Rute validasi pintu masuk *login* (`auth.service.ts`) dituntut mengalami revisi. Akun PT yang menyandang status `is_active = false` **wajib diblokir (ditolak)**, terlepas dari validnya kata sandi *password* yang ia berikan. Kordinasikan ini sebagai tugas pendamping (*Pull Request* terpisah/sekalian).
- **Modul Klien - Rekomendasi PT (`fitur/klien/PRD-pt-ku-klien.md`)**: Rute `GET /pt/recommendations` (yang spesifikasinya sudah dikunci/final) perlu merengkuh revisi susulan. Filter kueri mesin rekomendasinya kelak wajib menyertakan pengecualian `AND users.is_active = true` agar PT nonaktif (lulusan *soft-delete*) tidak memalukan aplikasi dengan terhidang di hadapan rekomendasi klien baru.
- **Penyelamatan Klien Aktif**: Klien yang dipegang oleh PT ter-*soft-delete* secara paksa digugurkan ke dalam lautan lepas lewat `pt_id = NULL`. Ini menjamin rute klien-klien tersebut agar diizinkan memohon proses *pairing* ulang di antarmuka mereka.

## Edge Cases

| Skenario | Penanganan (Response/Action) |
|---|---|
| Admin mencoba me-`POST` akun PT dengan email/username yang sudah bertengger di basis data | Digagalkan oleh sistem *database* berbekal *constraint unique*, mengembalikan tanggapan **HTTP 409 Conflict** (contoh: "Email/username sudah digunakan"). |
| Percobaan tembakan API tanpa JWT atau memakai JWT invalid | Menghantam tembok pemeriksaan token mentah menghasilkan penolakan murni **HTTP 401 Unauthorized**. |
| Percobaan tembakan API menggunakan otentikasi identitas JWT PT atau Klien | Ditolak kejam oleh gerbang pemeriksaan status otorisasi, disuguhi balasan **HTTP 403 Forbidden** "Akses Ditolak - Harus Admin". |
| Admin melakukan `DELETE` terhadap Klien / PT yang fiktif (ID tak dikenal) | Mengembalikan **HTTP 404 Not Found** ("User tidak ditemukan"). |

## Definition of Done

- [ ] Fungsi modifikasi rekam profil (POST, PUT, DELETE) telah bersenyawa mutlak dengan kewajiban _INSERT_ riwayat aktivitas dalam naungan kerangka *DB Transaction* yang solid tanpa pecah belah di `admin.service.ts`.
- [ ] Mesin berhasil memproduksi kata sandi *plaintext* semu (*temporary*) murni satu kali sebagai *response* pembuka untuk `POST /admin/users/pt` dan memastikan yang tersimpan ke tabel adalah artefak *hash bcrypt/argon2* yang aman.
- [ ] Berkas *migration database* untuk menyuntikkan kolom `is_active BOOLEAN DEFAULT true` pada tabel `users` berhasil dibuat, dijalankan, dan dikonfirmasi bersarang dengan baik pada *schema* sebelum implementasi *endpoint* berlangsung.
- [ ] Operasi pemusnahan Klien terbukti melancarkan kueri SQL `DELETE` murni, sementara pemusnahan PT dioperasikan melalui perintah `UPDATE` parameter kolom `is_active` secara aman.
- [ ] Pengikatan *dangling reference* teratasi penuh: Menghapus sebuah PT secara meyakinkan akan mereset properti `pt_id` milik seluruh klien naungannya menjadi kosong belaka (`NULL`).
- [ ] Format penyajian objek mematuhi *response shape* dengan sisipan indikator visual `isActive`, tata tertib *null eksplisit*, dan jaminan selubung sampul *envelope* `data`.
- [ ] **[Koordinasi Dependensi]** Telah diverifikasi bahwa logika pintu masuk `auth/` sukses menolak interaksi *login* apabila subjek PT beratribut `is_active = false`.
- [ ] **[Koordinasi Dependensi]** Fitur rekomendasi pada layar *frontend* Klien (via PRD terkait) telah direvisi agar luput (mengecualikan) dari daftar PT mati yang di-*soft-delete* supaya tidak mengecoh klien di *production*.
- [ ] Pengujian pergerakan API melalui REST Client (Postman) terverifikasi beroperasi stabil selaras dengan perlindungan berlapis cegatan HTTP status error 401 dan 403.
