# PRD Fitur: Riwayat Admin

## Metadata

| | |
|---|---|
| **Role** | Admin |
| **Branch** | `feat/riwayat-admin` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.3 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.3 (Web Admin — Riwayat Log) dan bab 5.3 (Alur Pengguna Admin).
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.3 (kontrak endpoint Admin).
- `docs/Bugarin_PRD_Frontend.md` bab tentang pemisahan UI Riwayat Admin (2 tab: Feedback Log & Admin Activity Log).
- `docs/bugarin_schema_notes.md` bab 9 (Admin Activity Log & Feedback query rules).
- `docs/bugarin_erd.mermaid` — tabel `feedbacks`, `admin_activity_logs`, `users`, `klien_profiles`, `pt_profiles`.
- `skills/api-contract-bugarin/SKILL.md` — kewajiban *envelope* `{ data: ... }` dan *camelCase*.
- `skills/jwt-auth-security/SKILL.md` — pelindung otoritas JWT `authGuard(["admin"])`.

## Ringkasan

Fitur ini bertugas mengekspos rekam jejak historis kepada Admin dalam wujud *Read-Only*. Fitur ini tidak menciptakan log apa pun, melainkan murni menyajikan hasil audit trail dari dua sektor operasional yang berbeda strukturnya: (1) aktivitas pengiriman pesan *Feedback* antara PT kepada Kliennya (sebagai transparansi interaksi pihak ketiga), dan (2) riwayat aktivitas *CRUD Admin* terhadap para pengguna (*activity logs*).

## Endpoint

| Method & Path | Fungsi |
|---|---|
| `GET /admin/riwayat` | Membaca daftar riwayat *feedback* PT dan aktivitas admin dengan format terpisah dalam satu kembalian. |

## Business Rules

1. **Pemisahan Struktur Objek Array Respons**: Sesuai dengan spesifikasi *Frontend* di mana antarmuka dibagi menjadi 2 tab (Feedback Log / Admin Activity Log), pengiriman data dari API tidak akan digabung mencampuradukkan kedua sumber log ke dalam satu *array* berbekal discriminator. API akan mengirimkan sebuah *object* berisi 2 *array* independen (`feedbackLogs` dan `adminActivityLogs`). Pola pemisahan (*segregation*) ini menyederhanakan *type-checking* dan *parsing* di klien Frontend karena masing-masing *array* mengemban skema *properties* yang sangat jauh berbeda sifatnya.
2. **Kueri Tunggal Ekstraksi Feedback (`source = 'pt'`)**: Sesuai titah di dokumen pedoman arsitektur, Backend diharamkan melahirkan tabel baru. Riwayat *feedback* diekstrak dari tabel `feedbacks` dengan syarat mutlak `WHERE source = 'pt'`.
3. **Resolusi Entitas (*JOIN* Database)**: ID mentah sangatlah merugikan untuk konsumsi Frontend. Oleh sebab itu, Backend akan meresolusi kolom-kolom ber-ID menjadi label nama yang *human-readable*:
   - **Pada Feedback Logs**: Harus me-*resolve* `pt_id` menjadi `namaPt` (via JOIN ke `pt_profiles` → `nama`) dan `klien_id` menjadi `namaKlien` (via JOIN ke `klien_profiles` → `nama`).
   - **Pada Admin Activity Logs**: Wajib me-*resolve* pelaku dari `admin_id` ke `namaAdmin` (via JOIN **dua tingkat**: `admin_activity_logs.admin_id` → `users.id` → `admin_profiles.user_id` → `admin_profiles.nama` — karena tabel `users` TIDAK memiliki kolom `nama`, kolom tersebut ada di `admin_profiles` sesuai ERD baris 62–66). Untuk target sasaran, me-*resolve* `target_user_id` menjadi `namaTargetUser` membutuhkan pendekatan khusus karena target bisa berupa PT atau Klien. Berbeda dengan `namaAdmin` yang pasti role-nya admin, resolusi `namaTargetUser` menuntut **LEFT JOIN Ganda**: (1) LEFT JOIN ke tabel `users` untuk basis relasi, (2) dilanjutkan LEFT JOIN kondisional/paralel ke `klien_profiles` DAN `pt_profiles` sekaligus. Nilai akhir didapatkan menggunakan ekspresi SQL `COALESCE(klien_profiles.nama, pt_profiles.nama)`. **Konfirmasi ERD**: Keberadaan kolom `target_user_id FK "nullable"` di tabel `admin_activity_logs` telah dikonfirmasi langsung dari `bugarin_erd.mermaid` baris 140 — kolom ini memang merupakan FK terpisah ke `users`, bukan bagian dari string `aksi`.
   - **Catatan tentang kolom `aksi`**: Kolom `aksi` (tipe `string`) berisi deskripsi teks gabungan yang JUGA menyebut nama target (contoh dari PRD-crud-user-admin BR#5: `"Admin membuat akun PT: Budi"`). Ini berarti ada **redundansi yang disengaja** — nama target sudah "dibekukan" sebagai *snapshot* di dalam teks `aksi` saat *insert*, DAN juga tersedia sebagai FK terpisah via `target_user_id`. Kedua kolom ini saling melengkapi: `aksi` berguna sebagai deskripsi mandiri yang tetap terbaca walau user dihapus, sedangkan `target_user_id` berguna untuk navigasi/link ke profil user yang masih hidup.
4. **Murni *Read-Only* Tanpa Aksi Mutasi**: Fungsi mutlak dilarang memanipulasi, menyunting, atau menghapus satupun data *log* di dalam kedua tabel basis data terkait.
5. **Proteksi *Dangling Target User* (LEFT JOIN)**: Mengingat Admin memiliki fitur mendelete pengguna (*hard-delete* bagi klien), ada kemungkinan sebuah baris di `admin_activity_logs` menunjuk ke `target_user_id` yang *row* penggunanya sudah tiada di tabel `users`. **Konfirmasi ERD**: Kolom `target_user_id` bertipe `FK "nullable"` (baris 140 di `bugarin_erd.mermaid`), sehingga nilainya bisa `NULL` (aksi yang tidak menargetkan user spesifik) ATAU menunjuk ke user yang sudah terhapus. Maka kueri pautan wajib menggunakan **LEFT JOIN**. Bila data sasaran kosong/hilang, Backend harus mengembalikan `namaTargetUser: null` (bukan error) — Frontend akan menampilkan fallback "Pengguna Terhapus" di sisinya, atau cukup membaca deskripsi lengkap dari kolom `aksi` yang sudah mengandung snapshot nama.
6. **Pengurutan Kronologis Terbalik (*Descending*)**: Kedua array wajib diurutkan berdasarkan `created_at DESC` (data terbaru di posisi paling atas), konsisten dengan pola "riwayat" di seluruh fitur lain project ini.

## Keputusan Desain (Final)

- **[KEPUTUSAN FINAL] Pembatasan Limit / Pagination**
  - **Konteks**: Tabel log aktivitas sistem (`admin_activity_logs` dan `feedbacks`) bersifat *append-only* (tumbuh selamanya tanpa batas). Mengikuti pola fitur PT/Klien yang menolak *pagination* adalah tindakan gegabah yang bisa menghancurkan *memory* instans bila ribuan baris terekam.
  - **Keputusan**: Diberlakukan pembatasan baris baku (maksimum `50` data terbaru yang diurutkan berdasar waktu mundur / *descending*) pada kedua array per pemanggilan *endpoint*. *Query params* tambahan seperti `page` opsional diterima jika Front-End berniat membentangkan log di masa depan.
  - **Alasan**: *Limit* `50` adalah jaring pengaman (*safety net*) paling pragmatis untuk kapabilitas PBL. Menyodorkan pagination mentah menekan *database stress* tanpa menambah komplikasi arsitektur. 

## Skema Data & Response Shape

**Response `GET /admin/riwayat?page=1&limit=50`**:
```json
{
  "data": {
    "feedbackLogs": [
      {
        "id": 105,
        "namaPt": "Budi Santoso",
        "namaKlien": "Andi Sehat",
        "pesan": "Pertahankan rutinitas lari paginya, volume ditambah 10%.",
        "createdAt": "2026-09-23T10:00:00.000Z"
      }
    ],
    "adminActivityLogs": [
      {
        "id": 21,
        "namaAdmin": "Super Admin",
        "namaTargetUser": "Joko PT Baru",
        "aksi": "Mendaftarkan akun PT baru",
        "createdAt": "2026-09-24T08:15:00.000Z"
      },
      {
        "id": 20,
        "namaAdmin": "Super Admin",
        "namaTargetUser": null,
        "aksi": "Menghapus Klien ID: 12",
        "createdAt": "2026-09-20T14:22:00.000Z"
      }
    ]
  },
  "meta": {
    "feedbackLogs": { "total": 42, "page": 1, "hasMore": false },
    "adminActivityLogs": { "total": 78, "page": 1, "hasMore": true }
  }
}
```
*(Catatan: `namaTargetUser` bernilai `null` bila user target sudah dihapus atau `target_user_id` memang kosong — Frontend bisa memakai isi kolom `aksi` yang sudah mengandung snapshot nama sebagai fallback).*

## Validasi (Zod) & Autorisasi

`authGuard(["admin"])` difungsikan seketat mungkin di modul rute.

```typescript
// GET /admin/riwayat
// Validasi penangkapan Pagination
getRiwayatQuerySchema: { 
  page?: number.int().positive().default(1),
  limit?: number.int().positive().max(100).default(50)
}
```

## File yang Akan Dibuat/Diubah

- `src/modules/admin/admin.routes.ts` `[MODIFY]` — Tambahkan entri rute perutean `GET /riwayat` berotentikasi.
- `src/modules/admin/admin.controller.ts` `[MODIFY]` — Deklarasi fungsi delegator *controller* beserta sampul *response* (envelope) `{ data: ... }`.
- `src/modules/admin/admin.service.ts` `[MODIFY]` — Penulisan logika kueri kompleks (bermuatan *LEFT JOIN*, fungsi filter pencarian spesifik `source='pt'`, serta implementasi perataan pembatasan `limit` & pengurutan).
- `src/modules/admin/admin.schema.ts` `[MODIFY]` — Melengkapi cetakan Zod skema untuk menangkap validasi opsional `page` dan `limit`.

## Urutan Implementasi

1. **Schema & Validasi**: Formulasi skema *query* penerima (`page`, `limit`) di `admin.schema.ts`.
2. **Service - Pengambilan 2 Sumber + 2 COUNT Secara Simultan**: Kerjakan deklarasi `Promise.all` di tingkat *service* yang menembak **empat** kueri basis data secara paralel: (a) data `feedbackLogs` dengan LIMIT/OFFSET, (b) data `adminActivityLogs` dengan LIMIT/OFFSET, (c) `COUNT(*)` total feedback logs, (d) `COUNT(*)` total admin activity logs. Keempat kueri ini independen satu sama lain sehingga aman diparalelkan tanpa risiko N+1.
3. **Service - Implementasi Kueri JOIN Kritis**: Siapkan relasi `feedbacks` ke tabel `klien_profiles` (via `klien_id`) dan `pt_profiles` (via `pt_id`) untuk resolve `namaKlien` dan `namaPt`. Setelahnya, desain rantai `admin_activity_logs` untuk resolve `namaAdmin` via JOIN dua tingkat (`admin_id` → `users` → `admin_profiles.nama`), dan resolve `namaTargetUser` secara spesifik via LEFT JOIN ke `users`, lalu LEFT JOIN paralel ke `klien_profiles` dan `pt_profiles`, untuk kemudian diproyeksikan dengan `COALESCE(klien_profiles.nama, pt_profiles.nama)`. Bila fungsi agregasi menghasilkan `NULL`, kembalikan `namaTargetUser: null` (bukan string fallback — Frontend yang menentukan label tampilannya).
4. **Service - Hitung Metadata Pagination**: Dari hasil `COUNT(*)` dan parameter `page`/`limit`, hitung `hasMore = (page * limit) < total` untuk masing-masing sumber.
5. **Controller & Routes**: Balut pengeluaran kueri menjadi objek `{ data: { feedbackLogs, adminActivityLogs }, meta: { feedbackLogs: {...}, adminActivityLogs: {...} } }` melalui rute tertutup *authGuard*.

## Dependency ke Fitur Lain

- Tunduk (tergantung) pada integritas pencetakan *feedback* milik `feat/feedback-pt` dan operasionalisasi injeksi jejak rekam mutasi milik `feat/crud-user-admin`.

## Edge Cases

| Skenario | Penanganan (Response/Action) |
|---|---|
| Kueri ditembak di hari ke-1, belum pernah ada aktivitas apapun maupun pengiriman *feedback* | Respons API akan tetap normal (*HTTP 200 OK*) mengirimkan *array* kosong `[]` pada kedua pilar pembagian array objek. |
| Parameter `limit` diselundupkan di atas 100 via URL query | Tertolak di baris pertahanan Zod, akan memberikan nilai default yang diizinkan atau merespons *400 Bad Request* sesuai ketetapan global. |
| Pengguna tak berwenang mengirim tembakan dengan *token* PT/Klien maupun tanpa *token* sama sekali | Terjegal oleh *middleware* otentikasi di pintu terdepan dengan pesan **HTTP 401 Unauthorized** (tak ada *token*) atau **HTTP 403 Forbidden** (role PT/Klien memaksa tembus jalur admin). |

## Definition of Done

- [ ] Arsitektur balasan API berpegang teguh pada desain 2 himpunan *array* terpisah (`feedbackLogs` dan `adminActivityLogs`) yang tidak ditumpuk campur-aduk.
- [ ] Pengikatan JOIN sukses me-resolve `admin_id` (via JOIN dua tingkat ke `admin_profiles.nama`), `pt_id` (via `pt_profiles.nama`), dan `klien_id` (via `klien_profiles.nama`) menjadi nama *human-readable*.
- [ ] LEFT JOIN untuk `target_user_id` menghasilkan `namaTargetUser: null` (bukan error) bila user target sudah terhapus — dikonfirmasi bahwa kolom FK `target_user_id` nullable di ERD (baris 140).
- [ ] Metadata pagination (`meta.feedbackLogs` dan `meta.adminActivityLogs`) mengembalikan `total`, `page`, dan `hasMore` yang akurat, dihitung dari query `COUNT(*)` paralel.
- [ ] Limitator data sukses membatasi pengeluaran log (default 50 entri per array) dan pengurutan `created_at DESC` berfungsi pada kedua sumber.
- [ ] Pemenuhan standar *camelCase* dan format bungkus *envelope* `{ data: ..., meta: ... }` tercapai.
