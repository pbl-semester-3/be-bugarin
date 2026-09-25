# PRD Fitur: Dashboard Admin

## Metadata

| | |
|---|---|
| **Role** | Admin |
| **Branch** | `feat/dashboard-admin` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.3 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.3 (Web Admin — Dashboard: statistik global platform) dan bab 4 (Peran Pengguna).
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.3 (kontrak endpoint Admin `GET /admin/dashboard-summary`).
- `docs/bugarin_schema_notes.md` bab 1 (Users & Role) dan bab 2 (Pairing Klien-PT).
- `docs/bugarin_erd.mermaid` — tabel `users`, `klien_profiles`, `pt_profiles`, `pairing_requests`.
- `skills/api-contract-bugarin/SKILL.md` — kewajiban *envelope* `{ data: ... }` dan *camelCase*.
- `skills/jwt-auth-security/SKILL.md` — penggunaan `authGuard(["admin"])`.

## Ringkasan

Fitur ini menyediakan sajian metrik tunggal untuk mengisi beranda (Dashboard) Web Admin. Endpoint ini mengembalikan data agregat statistik global yang mencerminkan "kesehatan operasional platform", meliputi distribusi jumlah pengguna (Klien & PT) dan interaksi dasar mereka (Pairing/pencocokan), tanpa menyelidiki ranah progres kebugaran personal (seperti log harian atau berat badan) yang ada di luar wewenang administratif.

## Endpoint

| Method & Path | Fungsi |
|---|---|
| `GET /admin/dashboard-summary` | Mengambil sekumpulan statistik agregat operasional secara *read-only*. |

## Business Rules

1. **Pemilihan Metrik Inti (Keputusan Produk Backend)**: Karena spesifikasi *Frontend* menyerahkan keleluasaan pada implementasi *Backend*, 4 (empat) metrik ini ditetapkan secara solid sebagai keluaran API:
   - `totalKlien`: Jumlah seluruh akun klien yang terdaftar di `klien_profiles` (mencerminkan perolehan *user base* utama/konsumen target platform).
   - `totalPt`: Jumlah seluruh akun Personal Trainer yang ada di `pt_profiles` (mencerminkan ketersediaan suplai penyedia jasa pelatihan dalam platform).
   - `totalPairingAktif`: Jumlah klien yang telah dilatih/dipasangkan dengan PT (`klien_profiles.pt_id IS NOT NULL`). Menunjukkan ukuran sebenarnya pengguna yang sedang aktif menikmati relasi interaksi inti aplikasi. (Catatan: Definisi pemakaian kondisi `pt_id IS NOT NULL` ini SENGAJA dirancang selaras mutlak dengan definisi "klien aktif" yang dipakai di metrik fitur PT pada `fitur/pt/PRD-dashboard-pt.md` demi menjamin konsistensi hitungan lintas-role secara sistem).
   - `totalRequestPending`: Jumlah pengajuan Klien kepada PT yang menggantung alias belum dijawab (di tabel `pairing_requests` dengan status = `'pending'`). Mengisyaratkan peringatan operasional apabila tumpukan request terlalu banyak (berpotensi PT jarang log in/mengabaikan permintaan).
2. **Kondisi Tanpa Data (0 User)**: Apabila *database* masih bersih (Admin baru kali pertama menggunakan sistem dan belum ada satupun entri klien maupun PT), respons sistem tidak boleh memunculkan `null` ataupun menimbulkan _error_. Sistem mutlak mengeluarkan nilai hitung `0` pada semua metrik yang terkait.
3. **Optimasi Anti-N+1 (Paralelisasi)**: Pengambilan 4 metrik tersebut terdiri dari perhitungan independen. Rutin API dilarang merangkainya secara sekuensial/berantai (menumpuk satu operasi demi operasi) yang dapat menahan jeda koneksi. Eksekusi `COUNT` pada ORM Drizzle wajib dijalankan selaras dan serempak via `Promise.all()`.
4. **Murni Analitik (Bebas AI)**: Mengingat fungsinya hanyalah perangkum data operasional database belaka, rute ini murni *deterministik* dan tidak perlu dieksekusi dengan campur tangan intervensi kecerdasan buatan (Gemini API) sama sekali.

## Keputusan Desain (Final)

- **[KEPUTUSAN FINAL] Pembatasan Ekstraksi Metrik Historis (*Time-Series*)**
  - **Konteks**: Terdapat kemungkinan ide untuk mengekstrak rekam tren bertingkat (contoh: "Pertumbuhan Jumlah Klien per Bulan") dalam *Dashboard*.
  - **Keputusan**: Dibatasi HANYA pada *snapshot* angka akumulatif total yang terjadi hari itu saja (sistem *single state* realitas).
  - **Alasan**: Menjaga proyek di skala aman dan sederhana untuk kelayakan PBL. Tidak ada desakan desain grafis bagan historis nan rumit dari purwarupa UI. Menyederhanakan ekstraksi kliping klusterisasi waktu meminimalisir ancaman *over-engineering* yang tidak perlu pada proses penyusunan SQL/Drizzle.

## Skema Data & Response Shape

**Response `GET /admin/dashboard-summary`**:
```json
{
  "data": {
    "totalKlien": 125,
    "totalPt": 10,
    "totalPairingAktif": 84,
    "totalRequestPending": 12
  }
}
```

## Validasi (Zod) & Autorisasi

Endpoint ini tidak menuntut persyaratan khusus struktur parameter (*body request* kosong) sehingga Zod tidak mendefinisikan skema validasi. Tetapi, *endpoint* mutlak dikawal keamanan identitas JWT:

```typescript
// Harus diautentikasi sebagai Super Admin pada level router
authGuard(["admin"])
```

## File yang Akan Dibuat/Diubah

- `src/modules/admin/admin.routes.ts` `[MODIFY]` — Menginjeksi penambahan entri rute `GET /dashboard-summary` di bawah payung *middleware* `authGuard(["admin"])`. (Modul dan file-file `admin/` ini diakui sudah eksis semenjak tahapan inisialisasi awal proyek, cukup dimodifikasi/dihapus status *stub*-nya).
- `src/modules/admin/admin.controller.ts` `[MODIFY]` — Mendefinisikan penanganan tangkapan *request* kosong dan pembungkus pengemasan balasan ke dalam *envelope* `{ data: ... }`.
- `src/modules/admin/admin.service.ts` `[MODIFY]` — File *service* lokasi perumusan *query* SQL/Drizzle untuk melangsungkan fungsi *count* dan operasi `Promise.all([countKlien, countPt, countPairing, countPending])`.

## Urutan Implementasi

1. **Pembuatan Service Method**: Tulis fungsi `getDashboardSummary` di dalam `admin.service.ts`. Rangkai 4 buah pencarian *COUNT* independen menggunakan utilitas bawaan Drizzle, kemudian raup hasilnya secara paralel via `Promise.all()`.
2. **Pembuatan Controller**: Deklarasikan *controller function* bernama `getDashboardSummaryHandler` pada `admin.controller.ts` guna mengkoordinir rute *service* melalui utilitas *error handling* standar (*express-async-handler* jika dipakai). Alirkan objek respons JSON berpelindung tipe `data`.
3. **Pendaftaran Router**: Sisipkan metode pendengar tersebut pada rute pendaftaran utama `admin.routes.ts`.

## Dependency ke Fitur Lain

- Bebas blokade/interdependensi. Kesuksesan metrik ini tidak menyandera kelangsungan API lain pada platform, melainkan murni tampil sebagai pembaca ringkasan informasi belaka.
- Nilai statistik yang ditampilkan seutuhnya merupakan bayangan dan muara dari keberadaan fitur `feat/pt-ku-klien` (pemasok `pairing_requests`) serta perputaran CRUD Admin `feat/crud-user-admin` di kemudian hari.

## Edge Cases

| Skenario | Penanganan (Response/Action) |
|---|---|
| Sistem baru menyala di _environment_ baru (hanya ada 1 akun Admin seed) | Respons API merespons mulus dengan status 200 OK dengan format angka `0` rata pada seluruh deret metrik *body*. |
| Percobaan tembakan API dilakukan sama sekali tanpa membawa token, atau menyelundupkan JWT yang invalid/kedaluwarsa | Menghantam tembok *middleware* otentikasi lapisan pertama, menghasilkan balasan **HTTP 401 Unauthorized** ("Tidak terautentikasi"). |
| Akses ilegal menggunakan token autentikasi yang valid namun bereputasi (role) Klien atau PT | Langsung diblokir pintu *middleware* otorisasi lapisan kedua, dan menyemburkan kesalahan berstatus **HTTP 403 Forbidden** ("Akses Ditolak - Harus Admin"). |

## Definition of Done

- [ ] Fungsi pengumpulan data agregat yang melingkupi _totalKlien, totalPt, totalPairingAktif, totalRequestPending_ termaterialisasi sempurna memanfaatkan manuver performa tinggi `Promise.all()` di *service*.
- [ ] Balasan akhir direspons sukses merajut struktur *envelope* kaku (`data: {...}`) serta menuruti disiplin nomenklatur *camelCase*.
- [ ] Angka nol (`0`) dikonfirmasi aman keluar bila perbendaharaan pangkalan data *database* masih benar-benar kosong, memastikan tidak ada krakat *null* aneh yang menyusup ke antarmuka aplikasi.
- [ ] Akses diisolasi dengan paku keling `authGuard(["admin"])`.
- [ ] Pengecekan uji manual melalui REST Client (Postman) mendapati tanggapan sukses selaras dengan kerangka standar desain.
