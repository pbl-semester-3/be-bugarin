# PRD Fitur: Profil PT

## Metadata

| | |
|---|---|
| **Role** | Personal Trainer (PT) |
| **Branch** | `feat/profil-pt` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.2 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.2 (Web PT — Profil), bab 5.2 (Alur Pengguna PT)
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.2 (kontrak endpoint PT)
- `docs/bugarin_erd.mermaid` — tabel `users`, `pt_profiles`
- `docs/bugarin_schema_notes.md` bab 1 (Users & Role)
- `fitur/klien/PRD-pt-ku-klien.md` (relevansi filter spesialisasi)
- `skills/express-typescript-patterns` (layering routes→controller→service)

## Ringkasan

Fitur pengelolaan profil bagi Personal Trainer (PT). Akun PT dibuat oleh Admin tanpa bisa mendaftar sendiri, sehingga PT akan melengkapi data pribadinya (usia, jenis kelamin, spesialisasi, dan tempat gym) pada saat atau setelah login pertama kali. Fitur ini sengaja dibuat sederhana dan langsung (tanpa sistem target siklus/progress_cycles seperti pada klien).

## Endpoint

| Method & Path | Fungsi |
|---|---|
| `GET /pt/profile` | Mengambil data profil PT (gabungan tabel `users` + `pt_profiles`) |
| `PUT /pt/profile` | Update data diri secara parsial (`nama`, `usia`, `jenisKelamin`, `spesialisasi`, `tempatGym`) |
| `PUT /pt/password` | Mengganti password akun PT |
| `PUT /pt/theme` | Mengubah tema antarmuka PT (siang/malam) |

## Business Rules

1. **`GET /pt/profile`**
   - Response menggabungkan data dasar dari tabel `users` (`email`, `username`) dan data dari tabel `pt_profiles` (`nama`, `usia`, `jenisKelamin`, `spesialisasi`, `tempatGym`).
   - Sesuai skema, sebagian besar atribut di `pt_profiles` bersifat *nullable* karena dibuat awal secara minimalis oleh Admin.
   
2. **`PUT /pt/profile`**
   - Operasi ini bersifat *partial update* — field yang tidak disertakan dalam *request body* tidak akan diubah di database.
   - **Yang bisa diubah**: `nama`, `usia`, `jenisKelamin`, `spesialisasi`, dan `tempatGym` (seluruhnya menyasar tabel `pt_profiles` — tabel `users` tidak disentuh oleh endpoint ini).
   - **Yang TIDAK BISA diubah melalui endpoint ini**: `email` dan `username`. Perubahan kredensial utama ini hanya boleh dilakukan oleh Admin (mengingat proses pembuatan akun adalah wewenang penuh Admin).

3. **`PUT /pt/password`**
   - Pola pembaruan *password* ini harus menyertakan verifikasi `passwordSaatIni` (current password yang sedang aktif) sebelum mengubahnya menjadi `passwordBaru` (minimal 8 karakter).
   
4. **`PUT /pt/theme`**
   - Menerima format yang sama persis seperti fitur Klien, yaitu memperbarui kolom tema di tabel `users` dengan *enum* (`siang` atau `malam`).

## Keputusan Desain (Open Questions)

- **[OPEN QUESTION] Flag `profileComplete` & Mekanisme Guard**
  Di `Bugarin_PRD.md` Bab 5.2 (Alur Pengguna PT), tertulis jelas: *Login → diarahkan ke Dashboard PT*. Tidak ada indikasi tertulis mengenai *Auth Guard* atau kewajiban mengisi profil bagi PT sebelum sanggup mengakses Dashboard (berbeda secara gamblang dengan modul *Mobile* klien yang diarahkan ke pengisian form *onboarding*). 
  - **Pertanyaan**: Apakah endpoint `GET /pt/profile` tetap perlu menyertakan flag boolean tambahan seperti `profileComplete` (mirip logika di Klien) guna memblokir PT secara fungsional pada aplikasi Web *Frontend* jika `tempatGym` masih kosong? Ataukah PT tetap bisa mengakses Dashboard tanpa hambatan meski profil belum 100% tuntas?
  - **Status**: Menunggu konfirmasi produk. (Jangan asumsikan validasi ini sendiri tanpa kepastian di UI Frontend).

## Skema Data & Response Shape

**Response `GET /pt/profile`**:
```json
{
  "data": {
    "user": {
      "id": 12,
      "email": "pt.budi@bugarin.com",
      "username": "ptbudi",
      "tema": "siang"
    },
    "profile": {
      "nama": "Budi Santoso",
      "usia": 30,
      "jenisKelamin": "pria",
      "spesialisasi": "turun_bb",
      "tempatGym": "Fithub Setiabudi"
    }
  }
}
```
*(Catatan: Jika boolean `profileComplete` diputuskan wajib ada, properti tersebut akan disisipkan ke dalam objek `data` ini)*.

## Validasi (Zod) & Autorisasi

Seluruh *endpoint* pada modul profil PT mutlak wajib dilindungi oleh *middleware* `authGuard(["pt"])`.

```typescript
// PUT /pt/profile
// Hanya validasi field yang boleh diedit PT
updateProfileSchema: { 
  nama?: string.min(1), 
  usia?: number.int().positive(), 
  jenisKelamin?: enum(['pria','wanita']), 
  spesialisasi?: enum(['turun_bb','naik_bb']), 
  tempatGym?: string.min(1) 
}

// PUT /pt/password
changePasswordSchema: { 
  passwordSaatIni: string, 
  passwordBaru: string.min(8) 
}

// PUT /pt/theme
changeThemeSchema: { 
  tema: enum(['siang','malam']) 
}
```

## File yang Akan Dibuat/Diubah

- `src/modules/pt/pt.schema.ts` `[MODIFY]` — Tambahkan skema validasi `updateProfileSchema`, `changePasswordSchema`, dan `changeThemeSchema`.
- `src/modules/pt/pt.routes.ts` `[MODIFY]` — Tambahkan rute untuk `GET /profile`, `PUT /profile`, `PUT /password`, dan `PUT /theme` lengkap dengan *middleware* `authGuard(["pt"])`.
- `src/modules/pt/pt.controller.ts` `[MODIFY]` — Tambahkan *handler* API guna memvalidasi *request*, meneruskan ke *service*, serta membalut seluruh respons sukses dalam *envelope* format `{ data: ... }`.
- `src/modules/pt/pt.service.ts` `[MODIFY]` — Wadah logika interaksi DB (menautkan data dari tabel `users` dengan `pt_profiles`).

## Urutan Implementasi

1. **Schema & Validasi**: Mendesain skema Zod pada file `pt.schema.ts` guna mengunci dan mengamankan bentuk data input (*body*).
2. **Service - Profile**: Menulis blok *logic* untuk `getProfile` (menyatukan data dari `users` + `pt_profiles` via JOIN) dan `updateProfile` (*partial update* yang seluruhnya membidik tabel `pt_profiles` saja — tabel `users` tidak disentuh oleh endpoint ini).
3. **Service - Password & Theme**: Menyusun *logic* pergantian *password* (lengkap dengan validasi *hash* password lama) dan pembaruan kolom tema UI.
4. **Controller & Routes**: Menyambungkan logika *service* melalui utilitas *error handling* standar `AppError` lalu mendeklarasikan rute-rutenya di dalam `pt.routes.ts`.

## Dependency ke Fitur Lain

Fitur ini memiliki relasi super krusial dengan `feat/pt-ku-klien` dan proses *Weekly Plan AI*:
- **`spesialisasi`**: Dipergunakan langsung sebagai parameter filter penyaringan utama oleh klien saat mencari rekomendasi PT (klien akan difilter berdasarkan PT yang spesifikasinya "turun BB" atau "naik BB").
- **`tempatGym`**: Parameter ini disuplai mentah-mentah sebagai asupan konteks lokasi dalam instruksi *prompt* saat mesin penjadwalan (*cron job*) menembak AI untuk menghasilkan *Weekly Plan*. Berkat nilai inilah, jadwal latihan klien dapat menunjukkan titik lokasi gym yang sesuai dengan basecamp PT-nya.

## Edge Cases

| Skenario | Penanganan (Response/Action) |
|---|---|
| Mengirim *body* kosong pada `PUT /pt/profile` | Bolehkan, tidak ada *query update* yang dieksekusi ke DB. Mengembalikan status sukses 200 OK dengan data balasan yang sama seperti sebelum diubah. |
| `PUT /pt/password` memasukkan `passwordSaatIni` yang salah | Mengembalikan error **HTTP 400** "Password saat ini tidak cocok" (dikategorikan sebagai kesalahan validasi input murni). |
| PT mengubah `tempatGym` di pertengahan minggu | Data `tempatGym` terbaru tidak akan mengubah `weekly_plan` yang statusnya telah tercetak (di-*generate*) di minggu tersebut. Perubahan ini akan berlaku efektif saat mesin *generate Weekly Plan* menembak jadwal untuk siklus minggu depan. |

## Definition of Done

- [ ] Semua rute endpoint terimplementasi mengacu teguh pada fondasi arsitektur lapis `express-typescript-patterns` (routes → controller → service).
- [ ] Operasi `PUT /pt/profile` sukses menjalankan eksekusi *partial update* ke tabel `pt_profiles` (untuk `nama`, `usia`, `jenisKelamin`, `spesialisasi`, `tempatGym`) — tabel `users` tidak disentuh oleh endpoint ini.
- [ ] Validasi Zod diterapkan secara total untuk membentengi PT dari upaya pengubahan informasi kredensial yang dilarang (yakni manipulasi input `email` atau `username` pada *request payload*).
- [ ] JIKA keputusan *Open Question* terkait flag `profileComplete` sudah final sebelum pengkodingan dimulai, maka atribut tersebut disisipkan ke *response* `GET /pt/profile` sesuai dengan keputusan. JIKA belum ada titik terang/jawaban saat developer mulai *coding*, fungsi ini dipersilakan dieksekusi **tanpa flag tersebut** (skenario default) agar pengembangan tidak dihalangi (di-*block*); flag dapat ditambahkan di *task* perbaikan belakangan.
- [ ] *Manual testing* (Postman) lolos sempurna tanpa cacat.
