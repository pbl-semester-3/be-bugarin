# PRD Fitur: Profil Admin

## Metadata

| | |
|---|---|
| **Role** | Admin |
| **Branch** | `feat/profil-admin` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.3 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.3 (Web Admin — Profil: data diri, ganti password, tema), bab 4 (Peran Pengguna — Admin dibuat manual saat inisialisasi/seed), bab 5.3 (Alur Pengguna Admin — poin 4: "Admin dapat mengubah data diri, password, dan tema").
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.3 (kontrak endpoint Admin — `GET/PUT /admin/profile`, `PUT /admin/password`, `PUT /admin/theme`).
- `docs/bugarin_erd.mermaid` — tabel `users` (baris 21–30), tabel `admin_profiles` (baris 62–66: hanya `id PK`, `user_id FK`, `nama`).
- `docs/bugarin_schema_notes.md` bab 1 (Users & Role — Admin dibuat manual/seed, `users` sebagai basis autentikasi seluruh role).
- `fitur/pt/PRD-profil-pt.md` — referensi pola endpoint GET/PUT profile + PUT password + PUT theme (diikuti dengan penyesuaian perbedaan konteks Admin).
- `fitur/admin/PRD-riwayat-admin.md` — referensi gaya penulisan PRD Admin terbaru.
- `skills/api-contract-bugarin/SKILL.md` — kewajiban *envelope* `{ data: ... }` dan *camelCase*.
- `skills/jwt-auth-security/SKILL.md` — `authGuard(["admin"])`, pola verifikasi password lama.

## Ringkasan

Fitur pengelolaan profil bagi Admin. Akun Admin dibuat manual saat inisialisasi sistem (seed) — tidak ada UI pembuatan akun Admin, dan tidak ada role yang lebih tinggi di atasnya. Dibandingkan dengan Profil PT, fitur ini **jauh lebih sederhana** karena `admin_profiles` di ERD hanya memiliki satu field data diri (`nama`) — tidak ada field spesifik seperti usia, jenisKelamin, spesialisasi, atau tempatGym yang dimiliki PT.

## Endpoint

| Method & Path | Fungsi |
|---|---|
| `GET /admin/profile` | Mengambil data profil Admin (gabungan tabel `users` + `admin_profiles`) |
| `PUT /admin/profile` | Update data diri secara parsial |
| `PUT /admin/password` | Mengganti password akun Admin |
| `PUT /admin/theme` | Mengubah tema antarmuka Admin (siang/malam) |

## Business Rules

1. **`GET /admin/profile`**
   - Response menggabungkan data dari tabel `users` (`email`, `username`, `tema`) dan data dari tabel `admin_profiles` (`nama`).
   - **Perbedaan vs Profil PT**: Tabel `admin_profiles` di ERD (baris 62–66 `bugarin_erd.mermaid`) hanya memiliki 3 kolom: `id PK`, `user_id FK`, dan `nama`. Tidak ada field `usia`, `jenisKelamin`, `spesialisasi`, atau `tempatGym` seperti `pt_profiles`. Objek `profile` dalam response karena itu hanya berisi `nama`.

2. **`PUT /admin/profile`**
   - Operasi ini bersifat *partial update* — field yang tidak disertakan dalam *request body* tidak akan diubah di database.
   - **Yang bisa diubah**: `nama` (menyasar tabel `admin_profiles`), `email`, dan `username` (menyasar tabel `users`).
   - **Perbedaan krusial vs Profil PT**: PT dilarang mengubah `email` dan `username` sendiri karena kedua kredensial itu wewenang Admin yang membuatkan akunnya. Namun Admin berada di posisi yang berbeda secara fundamental — Admin **tidak punya atasan** (akunnya dibuat via seed, bukan oleh role lain) dan **tidak ada pihak lain yang bisa membantu** kalau Admin terkunci dari akunnya gara-gara email/username yang salah tanpa mekanisme koreksi. Oleh karena itu, Admin **DIIZINKAN** mengubah email dan username miliknya sendiri melalui endpoint ini.
   - **Validasi keunikan**: Meski dalam skala PBL kemungkinan hanya ada 1 Admin, validasi `UNIQUE` constraint pada `email` dan `username` di tabel `users` tetap diterapkan secara default (aman kalau di masa depan ada seed multi-admin). Duplikat menghasilkan **HTTP 409 Conflict**.

3. **`PUT /admin/password`**
   - Pola pembaruan password mengikuti konvensi identik dengan PRD-profil-pt.md: wajib menyertakan `passwordSaatIni` (current password yang sedang aktif) untuk diverifikasi, sebelum mengubahnya menjadi `passwordBaru` (minimal 8 karakter).
   - Password lama salah menghasilkan **HTTP 400 Bad Request** ("Password saat ini tidak cocok") — dikategorikan sebagai kesalahan validasi input, bukan 401 (yang bermakna token/sesi invalid). Ini konsisten dengan keputusan final di PRD-profil-pt.md.

4. **`PUT /admin/theme`**
   - Menerima format identik dengan fitur PT dan Klien: memperbarui kolom `tema` di tabel `users` dengan enum `siang` atau `malam`.

## Keputusan Desain (Final)

- **[KEPUTUSAN FINAL] Admin BOLEH Mengubah Email & Username Sendiri**
  - **Konteks**: PRD-profil-pt.md melarang PT mengubah email/username sendiri karena itu wewenang Admin yang membuatkan akunnya. Pertanyaannya: apakah aturan yang sama berlaku untuk Admin?
  - **Keputusan**: Admin **diizinkan** mengubah email dan username miliknya sendiri melalui `PUT /admin/profile`.
  - **Alasan**: Admin adalah *superuser* yang dibuat via seed — tidak ada role di atasnya yang bisa "membantu" mengubah kredensialnya. Kalau Admin dilarang mengubah email/username sendiri, maka satu-satunya cara mengoreksi kesalahan adalah mengubah database secara manual (akses langsung ke MySQL), yang lebih berisiko daripada menyediakan endpoint yang tervalidasi. Prinsip *least-privilege* tetap terjaga karena endpoint ini dilindungi `authGuard(["admin"])` — hanya Admin yang sudah terotentikasi yang bisa mengaksesnya.

- **[KEPUTUSAN FINAL] Tidak Ada Flag `profileComplete`**
  - **Konteks**: PRD-profil-pt.md memiliki Open Question soal flag `profileComplete` (apakah PT harus melengkapi profil sebelum bisa mengakses dashboard). Admin tidak punya masalah ini.
  - **Keputusan**: Tidak ada flag `profileComplete` di response `GET /admin/profile`.
  - **Alasan**: Admin dibuat via seed dengan data yang sudah final sejak awal (nama, email, username, password sudah diisi saat seed). Tidak ada alur "lengkapi profil nanti" seperti PT yang akunnya dibuat minimalis oleh Admin. Selain itu, `admin_profiles` hanya punya kolom `nama` — tidak ada field nullable lain yang perlu "dilengkapi".

## Skema Data & Response Shape

**Response `GET /admin/profile`**:
```json
{
  "data": {
    "user": {
      "id": 1,
      "email": "admin@bugarin.com",
      "username": "superadmin",
      "tema": "malam"
    },
    "profile": {
      "nama": "Super Admin"
    }
  }
}
```

**Request Body `PUT /admin/profile`** (semua field opsional, partial update):
```json
{
  "nama": "Admin Bugarin",
  "email": "admin-baru@bugarin.com",
  "username": "adminbaru"
}
```

## Validasi (Zod) & Autorisasi

Seluruh endpoint pada modul profil Admin mutlak wajib dilindungi oleh middleware `authGuard(["admin"])`.

```typescript
// PUT /admin/profile
// Admin bisa edit nama, email, dan username (beda dari PT yang tidak bisa edit email/username)
updateProfileSchema: {
  nama?: string.min(1),
  email?: string.email(),
  username?: string.min(3)
}

// PUT /admin/password
changePasswordSchema: {
  passwordSaatIni: string,
  passwordBaru: string.min(8)
}

// PUT /admin/theme
changeThemeSchema: {
  tema: enum(['siang', 'malam'])
}
```

## File yang Akan Dibuat/Diubah

- `src/modules/admin/admin.schema.ts` `[MODIFY]` — Tambahkan skema validasi `updateProfileSchema`, `changePasswordSchema`, dan `changeThemeSchema`.
- `src/modules/admin/admin.routes.ts` `[MODIFY]` — Tambahkan rute untuk `GET /profile`, `PUT /profile`, `PUT /password`, dan `PUT /theme` lengkap dengan middleware `authGuard(["admin"])`.
- `src/modules/admin/admin.controller.ts` `[MODIFY]` — Tambahkan handler API guna memvalidasi request, meneruskan ke service, serta membalut seluruh respons sukses dalam envelope format `{ data: ... }`.
- `src/modules/admin/admin.service.ts` `[MODIFY]` — Wadah logika interaksi DB (menautkan data dari tabel `users` dengan `admin_profiles`, update partial lintas 2 tabel, verifikasi password lama).

## Urutan Implementasi

1. **Schema & Validasi**: Mendesain skema Zod pada file `admin.schema.ts` guna mengunci bentuk data input body untuk ketiga operasi PUT.
2. **Service - Profile**: Menulis logika untuk `getProfile` (menggabungkan data dari `users` + `admin_profiles` via JOIN) dan `updateProfile` (partial update yang bisa menyasar kolom `nama` di `admin_profiles` DAN/ATAU kolom `email`/`username` di `users` dalam satu transaksi — perlu penanganan `UNIQUE` constraint error untuk 409 Conflict).
3. **Service - Password & Theme**: Menyusun logika pergantian password (lengkap dengan validasi hash password lama via `argon2.verify`, return HTTP 400 jika tidak cocok) dan pembaruan kolom `tema` di `users`.
4. **Controller & Routes**: Menyambungkan logika service melalui utilitas error handling standar `AppError` lalu mendeklarasikan rute-rutenya di dalam `admin.routes.ts`.

## Dependency ke Fitur Lain

- Tidak ada dependency krusial. Berbeda dari Profil PT yang field `spesialisasi` dan `tempatGym`-nya dipakai modul lain (rekomendasi PT dan Weekly Plan AI), Profil Admin bersifat **mandiri penuh** — field `nama` di `admin_profiles` hanya digunakan untuk display nama Admin di UI Dashboard dan resolusi `namaAdmin` di `GET /admin/riwayat` (yang sudah di-JOIN dari tabel sumber, bukan bergantung pada endpoint profil ini).

## Edge Cases

| Skenario | Penanganan (Response/Action) |
|---|---|
| Mengirim body kosong pada `PUT /admin/profile` | Bolehkan, tidak ada query update yang dieksekusi ke DB. Mengembalikan status sukses **HTTP 200 OK** dengan data profil yang sama seperti sebelum diubah. |
| `PUT /admin/password` memasukkan `passwordSaatIni` yang salah | Mengembalikan error **HTTP 400 Bad Request** "Password saat ini tidak cocok" (kesalahan validasi input, bukan 401). |
| `PUT /admin/profile` mengubah email/username ke nilai yang sudah dipakai user lain | Ditolak oleh constraint `UNIQUE` di tabel `users`, mengembalikan **HTTP 409 Conflict** ("Email/username sudah digunakan"). |
| `PUT /admin/profile` mengubah email ke format yang bukan email valid | Ditolak oleh validasi Zod sebelum menyentuh database, mengembalikan **HTTP 400 Bad Request** dengan detail field error. |
| Percobaan akses endpoint tanpa JWT atau dengan JWT role PT/Klien | **HTTP 401 Unauthorized** (tanpa token) atau **HTTP 403 Forbidden** (role bukan admin). |

## Definition of Done

- [ ] Semua rute endpoint terimplementasi mengacu pada arsitektur lapis `express-typescript-patterns` (routes → controller → service).
- [ ] Operasi `PUT /admin/profile` sukses menjalankan *partial update* gabungan ke tabel `users` (untuk email/username) dan `admin_profiles` (untuk nama) dalam satu transaksi.
- [ ] Admin terverifikasi BISA mengubah email dan username miliknya sendiri (berbeda dari PT yang dilarang), dengan penanganan 409 Conflict untuk duplikat.
- [ ] `PUT /admin/password` mengembalikan HTTP 400 (bukan 401) untuk password lama yang salah, konsisten dengan PRD-profil-pt.md.
- [ ] Response `GET /admin/profile` mengikuti format envelope `{ data: { user: {...}, profile: {...} } }` dengan camelCase.
- [ ] Manual testing (Postman) lolos sempurna tanpa cacat.
