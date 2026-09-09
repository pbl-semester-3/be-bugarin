# Bugarin — PRD Turunan: Backend + AI

Dokumen ini adalah turunan dari `Bugarin_PRD.md` (PRD induk), khusus untuk tim/developer yang mengerjakan Backend (Express) dan integrasi AI (Gemini API). Rujuk `bugarin_erd.mermaid` dan `bugarin_schema_notes.md` untuk detail skema data.

---

## 1. Tech Stack Backend

| Komponen | Pilihan |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| ORM | Drizzle (`drizzle-orm/mysql2`) |
| Database | MySQL 8 |
| Validasi | Zod + drizzle-zod |
| Auth | JWT (`jsonwebtoken`) |
| AI | Google Gemini API (`@google/generative-ai`) |
| Scheduled Job | node-cron |
| Security | helmet, cors, express-rate-limit |

---

## 2. Struktur Folder (usulan)

```
src/
 ├─ config/          # env, db connection, gemini client
 ├─ db/
 │   ├─ schema/       # drizzle schema per tabel
 │   └─ migrations/
 ├─ modules/
 │   ├─ auth/
 │   ├─ klien/
 │   ├─ pt/
 │   ├─ admin/
 │   ├─ master-data/
 │   └─ ai/           # weekly-plan generator, feedback generator, kalkulasi kalori
 ├─ middlewares/      # auth guard, error handler, rate-limit
 ├─ jobs/             # node-cron: generate-weekly-plan.ts
 └─ app.ts
```

---

## 3. Autentikasi & Middleware

- `POST /auth/register` (klien saja) — validasi Zod, hash password (bcrypt/argon2), simpan `users` + `klien_profiles`.
- `POST /auth/login` — cek kredensial, terbitkan JWT (`sub`, `role`).
  - **Web** (PT/Admin login dari Next.js): set token via cookie `httpOnly; Secure; SameSite=Strict`.
  - **Mobile**: token dikembalikan di response body, disimpan klien di `flutter_secure_storage`, dikirim via header `Authorization: Bearer`.
- `POST /auth/logout` — clear cookie (web) / no-op sisi server (mobile cukup hapus token lokal).
- Middleware `authGuard(roles: string[])` — verifikasi JWT, cek role sesuai endpoint.
- Middleware global: `helmet()`, `cors({ origin: [WEB_ORIGIN], credentials: true })`, `express-rate-limit` khusus `/auth/*`.

---

## 4. Kontrak API Lengkap

### 4.1 Klien (Mobile)

| Method & Path | Deskripsi |
|---|---|
| `GET /klien/profile` | Profil + cycle aktif |
| `PUT /klien/profile` | Update data diri |
| `PUT /klien/password` | Ganti password |
| `PUT /klien/theme` | Ganti tema |
| `POST /klien/weight-logs` | Insert BB baru → trigger cek goal tercapai |
| `GET /klien/progress-cycles` | List semua siklus |
| `POST /klien/progress-cycles` | Mulai siklus baru (tutup cycle lama jika ada yang masih aktif) |
| `GET /klien/progress-cycles/:id/logs` | Daily log dalam rentang siklus |
| `GET /pt/recommendations?tujuan=` | Rekomendasi PT (public untuk klien login) |
| `POST /klien/pairing-requests` | Kirim request PT (tolak jika masih ada pending) |
| `GET /klien/pairing-requests/current` | Status request aktif |
| `GET /klien/dashboard-summary` | Agregat: PT aktif, kalori, streak, jadwal, reminder |
| `GET /klien/weekly-plan/current` | Weekly plan minggu berjalan |
| `POST /klien/activity-logs` | Catat olahraga → hitung kalori terbakar |
| `POST /klien/meal-logs` | Catat makanan → hitung kalori masuk (lookup/AI-generate master) |
| `GET /klien/feedbacks` | List feed AI + PT |
| `POST /klien/feedbacks/:id/reply` | Balas feedback (hanya jika `balasan_klien` masih null) |
| `PUT /klien/feedbacks/:id/read` | Tandai dibaca |

### 4.2 Personal Trainer (Web)

| Method & Path | Deskripsi |
|---|---|
| `GET /pt/profile` / `PUT /pt/profile` | Profil PT — **wajib termasuk `tempat_gym`** sebelum PT bisa menerima klien |
| `PUT /pt/password` / `PUT /pt/theme` | Ganti password/tema |
| `GET /pt/dashboard-summary` | Jumlah klien, jadwal minggu ini (gabungan semua klien) |
| `GET /pt/pairing-requests` | List request pending |
| `PUT /pt/pairing-requests/:id` | Terima (body kosong) atau tolak (body: `alasan_penolakan`) |
| `GET /pt/klien` | List klien diterima |
| `GET /pt/klien/:id` | Detail klien + histori `weight_logs` (untuk grafik) |
| `GET /pt/klien/:id/weekly-plan` | Plan klien yang perlu direview |
| `PUT /pt/weekly-plan/:id/approve` | Setuju plan (status → disetujui) |
| `PUT /pt/weekly-plan/:id/override` | Edit manual (body: `workout_plan`, `meal_plan` baru; status → override) |
| `GET /pt/riwayat` | List ringkas klien (nama, usia, gender, BB awal-sekarang) |
| `POST /pt/klien/:id/feedbacks` | Kirim feedback ke klien tertentu |

### 4.3 Admin (Web)

| Method & Path | Deskripsi |
|---|---|
| `GET /admin/profile` / `PUT /admin/profile` | Profil admin |
| `PUT /admin/password` / `PUT /admin/theme` | Ganti password/tema |
| `GET /admin/dashboard-summary` | Statistik global platform |
| `GET /admin/users?role=` | List klien/PT |
| `POST /admin/users/pt` | **Buat akun PT baru langsung** (tanpa approval — admin input email, password sementara, nama; PT lengkapi sisanya saat login pertama) |
| `PUT /admin/users/:id` | Edit user |
| `DELETE /admin/users/:id` | Hapus user |
| `GET /admin/riwayat` | Gabungan `feedbacks WHERE source='pt'` + `admin_activity_logs` |

### 4.4 Master Data (shared, semua role login)

| Method & Path | Deskripsi |
|---|---|
| `GET /master/olahraga` | List master olahraga (untuk dropdown) |
| `GET /master/makanan?q=` | Search master makanan (preset + hasil ai_generated sebelumnya) |

---

## 5. Business Logic Krusial

### 5.1 Streak (Logika OR)
```
streak_hari_ini = EXISTS(activity_logs WHERE klien_id=X AND tanggal=today)
                  OR EXISTS(meal_logs WHERE klien_id=X AND tanggal=today)
```
Hitung mundur dari hari ini selama kondisi di atas `true` berturut-turut → itu jumlah streak.

### 5.2 Kalkulasi Kalori
- Olahraga: `kalori_terbakar = master_olahraga.met_value × berat_badan_kg × (durasi_menit / 60)`. `berat_badan_kg` diambil dari `weight_logs` terbaru klien saat itu.
- Makanan: `kalori_masuk = master_makanan.kalori_per_100g × (porsi_gram / 100)`.
- Kedua nilai **dihitung dan disimpan saat insert** (snapshot) — tidak dihitung ulang saat dibaca, supaya histori tidak berubah walau data master di-update di kemudian hari.

### 5.3 Deteksi Goal Tercapai (dijalankan setelah `POST /klien/weight-logs`)
```
cycle = progress_cycles WHERE klien_id=X AND status='aktif'
if cycle.tujuan == 'turun_bb' and bb_baru <= cycle.bb_tujuan_kg: goal tercapai
if cycle.tujuan == 'naik_bb' and bb_baru >= cycle.bb_tujuan_kg: goal tercapai

if goal tercapai:
  update cycle: status='selesai', tanggal_selesai=NOW()
```

### 5.4 Reminder Durasi Lewat (dihitung saat `GET /klien/dashboard-summary`)
```
if cycle.status == 'aktif' and NOW() > cycle.tanggal_mulai + cycle.durasi_hari:
  sertakan flag reminder=true di response dashboard-summary
```

### 5.5 Mulai Siklus Baru
`POST /klien/progress-cycles` — validasi: cycle lama (jika masih ada & belum `selesai`) otomatis ditutup dengan `tanggal_selesai=NOW()` sebelum cycle baru dibuat. `bb_awal_kg` cycle baru = entry `weight_logs` terakhir klien.

### 5.6 Master Makanan Dinamis
Saat `POST /klien/meal-logs` dengan nama makanan yang tidak ditemukan di `master_makanan`:
1. Panggil AI (lihat 6.3) untuk estimasi `kalori_per_100g`.
2. Insert ke `master_makanan` dengan `sumber = ai_generated`.
3. Lanjutkan hitung `kalori_masuk` seperti biasa dari entry yang baru dibuat.

---

## 6. Integrasi AI (Gemini API)

Seluruh pemanggilan Gemini API dieksekusi di backend (modul `ai/`), tidak pernah dari klien. Karena Bugarin tidak punya fitur chatbot/free-text conversational, prompt injection formal tidak jadi requirement wajib (dikonfirmasi dosen) — namun struktur Role/Constraint/Output Schema tetap diterapkan sebagai praktik baik agar output AI konsisten dan mudah divalidasi.

### 6.1 Generate Weekly Plan
**Trigger:** onboarding awal + node-cron tiap awal minggu (untuk semua klien dengan `pt_id` terisi dan cycle aktif).

- **Role**: "Kamu adalah asisten perencana program kebugaran."
- **Constraint**: input = tinggi badan, alergi makanan, BB awal/sekarang/tujuan, tujuan (turun/naik BB), lokasi gym PT. Tidak boleh menyarankan makanan yang mengandung alergi klien. Jadwal latihan disusun 2–3 hari/minggu.
- **Output Schema (JSON)**:
```json
{
  "workout_plan": [
    { "hari": "Senin", "jam": "16:00", "jenis": "Upper Body", "lokasi": "GYM Fithub" }
  ],
  "meal_plan": [
    { "waktu": "Sarapan", "menu": "Oatmeal + pisang", "estimasi_kalori": 350 }
  ]
}
```
- Backend validasi JSON sesuai schema sebelum insert ke `weekly_plans` (status = `pending_review`). Field `lokasi` diisi dari `pt_profiles.tempat_gym`, bisa langsung disisipkan backend (tidak perlu diminta ke AI) untuk mengurangi risiko hallucination pada data yang sebenarnya sudah pasti.

### 6.2 Feedback Real-time
**Trigger:** setelah `POST /klien/activity-logs` atau `POST /klien/meal-logs`.

- **Role**: "Kamu adalah AI health coach yang suportif dan singkat."
- **Constraint**: berdasarkan data historis 7 hari terakhir klien (kalori masuk/keluar, tren BB). Maksimal 2 kalimat. Tidak memberi saran medis spesifik.
- **Output**: teks singkat, disimpan ke `feedbacks` (`source = ai`, `pt_id = null`).

### 6.3 Estimasi Kalori Makanan Custom
**Trigger:** `meal_logs` dengan nama makanan yang belum ada di `master_makanan`.

- **Role**: "Kamu adalah asisten estimasi nilai gizi makanan Indonesia."
- **Constraint**: hanya kembalikan estimasi kalori per 100 gram, angka masuk akal (0–900 kkal/100g).
- **Output Schema (JSON)**: `{ "kalori_per_100g": number, "kategori": "karbohidrat|protein|sayur|lainnya" }`.
- Backend validasi angka dalam rentang wajar sebelum insert ke `master_makanan` — kalau AI mengembalikan nilai di luar rentang, fallback ke nilai default kategori generik + log untuk review manual.

---

## 7. Scheduled Job (node-cron)

| Job | Jadwal | Fungsi |
|---|---|---|
| `generate-weekly-plan` | Tiap Senin 00:00 | Loop semua klien dengan `pt_id` terisi & cycle `aktif` → panggil 6.1 → insert `weekly_plans` baru |

---

## 8. Validasi (Zod + drizzle-zod)

- Setiap endpoint POST/PUT wajib divalidasi via schema Zod yang di-generate dari Drizzle schema (`drizzle-zod`) ditambah aturan tambahan (mis. `password.min(8)`, `porsi_gram.positive()`).
- Response error konsisten: `{ "error": { "field": "pesan" } }` untuk validasi, `{ "error": "pesan" }` untuk error umum.

---

## 9. Indexing (MySQL)

Sesuai requirement kampus, tambahkan index pada:
- `klien_profiles.pt_id`, `pairing_requests.klien_id`, `pairing_requests.pt_id` (FK yang sering di-query)
- `weight_logs.klien_id + tanggal` (composite, untuk query histori terurut)
- `activity_logs.klien_id + tanggal`, `meal_logs.klien_id + tanggal`
- `master_makanan.nama`, `master_olahraga.nama` (UNIQUE + index, untuk lookup cepat)
