# Bugarin — Product Requirements Document

**Personalized Health & Workout Planner**
Project Milestone UAS — Software Engineering Division

---

## 1. Overview

Bugarin adalah sistem monitoring kebugaran yang menghubungkan dua peran yang saling bergantung: Klien dan Personal Trainer (PT). PT dapat memantau progres klien — berat badan dan aktivitas harian/mingguan/bulanan — sementara Klien menerima dua sumber feedback: masukan langsung dari PT dan rekomendasi berbasis AI yang dihasilkan dari data historis progres mereka.

Selain modul Klien dan PT, terdapat Dashboard Web Admin untuk mengelola seluruh pengguna platform. Implementasi AI berfokus pada dua hal: (1) menghasilkan Weekly Plan (jadwal latihan dan menu makan) secara generatif berdasarkan profil klien, dan (2) memberikan feedback tekstual real-time berdasarkan data historis progres klien.

### 1.1 Base Requirement (Ide Proyek)

- Dashboard Web untuk PT — melihat analitik serta histori data klien.
- Mobile App untuk memaksimalkan fleksibilitas akses, khususnya untuk Klien.
- Dashboard Web untuk Admin — mengelola seluruh user pada sistem Bugarin.

---

## 2. Kepatuhan terhadap Baseline Requirement Kampus

Bugarin dirancang untuk memenuhi seluruh baseline requirement minimum proyek Milestone UAS, dengan penyesuaian yang telah dikonfirmasi ke dosen pengampu.

| Requirement | Pemenuhan di Bugarin |
|---|---|
| Arsitektur Client-Server | Frontend (Next.js / Flutter) terpisah penuh dari Backend (Express.js) |
| Dashboard Web — manajerial/pemantau | Web PT (monitoring klien) dan Web Admin (statistik global) |
| Mobile App — pengguna akhir | Mobile App Klien (Flutter) |
| Schema REST API | Axios (frontend) ↔ REST endpoints Express (backend) |
| Database Type (MySQL + Indexing) | MySQL 8, indexing pada kolom FK dan kolom pencarian (nama makanan/olahraga) |
| 5 Kategori Tabel Struktural | Pengguna & Peran, Data Master, Transaksi/Log Harian, Hasil Analisis AI, Log Audit |
| Backend-Driven AI | Seluruh pemanggilan Gemini API dieksekusi dari backend Express, tidak pernah dari klien |
| Algoritma Wajib (salah satu) | Generative AI & LLM — Google Gemini API |
| Prompt Engineering Strict Schema & Mitigasi Prompt Injection | Dikonfirmasi ke dosen: tidak wajib, karena Bugarin tidak memiliki fitur chatbot/percakapan bebas ke AI (input AI selalu terstruktur dari backend) |

---

## 3. Ruang Lingkup

### 3.1 Fitur Mobile — Klien

| Fitur | Deskripsi |
|---|---|
| Dashboard (Beranda) | PT aktif, target kalori harian, streak (logika OR), jadwal latihan mingguan hasil generate AI (termasuk lokasi gym), banner reminder jika durasi target sudah lewat tapi belum tercapai |
| PT ku | Rekomendasi PT berdasarkan tujuan (turun/naik BB) — pilih → request → menunggu approval PT. Kosong jika profil belum lengkap |
| Progres | Weekly Plan AI (workout + meal) dari profil; log manual olahraga (jenis, durasi, jarak) dan makanan (preset/custom + porsi); kalori dihitung otomatis |
| Riwayat Progres | Daftar card per siklus target ("Progres 1", "Progres 2", dst — cycle aktif ditandai "Berjalan"). Tiap card bisa di-expand menampilkan log harian (kalori masuk vs keluar) dalam rentang tanggal siklus tsb |
| Feedback | Feed gabungan AI (realtime) dan PT (mingguan), badge notifikasi, balasan 1x per feedback |
| Profil | Data diri + alergi, tinggi badan, BB Sekarang (tiap disimpan = entry baru ke histori BB), progress bar BB. Banner "Mulai Target Baru" muncul saat siklus selesai (goal tercapai). Ganti password, tema siang/malam |

### 3.2 Fitur Web — Personal Trainer (PT)

| Fitur | Deskripsi |
|---|---|
| Dashboard | Jumlah klien aktif, jadwal latihan mingguan hasil generate AI (seluruh klien), termasuk lokasi gym |
| Verifikasi | Terima/tolak request klien baru (tolak wajib isi alasan) |
| Klien | Detail data klien diterima, grafik BB historis, review Weekly Plan AI — Setuju atau Override (edit manual, misal cedera) |
| Riwayat | List ringkas seluruh klien: nama, usia, gender, BB awal-sekarang |
| Feedback | Pilih klien dari daftar → tulis masukan/semangat → notifikasi realtime ke klien |
| Profil | Data diri + spesialisasi (turun/naik BB) + **tempat gym** (lokasi mengajar, wajib diisi — dipakai AI untuk menyusun jadwal latihan klien), ganti password, tema |

### 3.3 Fitur Web — Admin

| Fitur | Deskripsi |
|---|---|
| Dashboard | Statistik global platform |
| CRUD User | Kelola Klien (edit/hapus) dan PT (tambah, edit, hapus). Akun PT dibuat langsung oleh Admin — tidak ada registrasi/approval mandiri untuk PT |
| Riwayat | Log aktivitas feedback PT→Klien (audit) dan log aktivitas CRUD yang dilakukan Admin sendiri |
| Profil | Data diri, ganti password, tema |

### 3.4 Di Luar Lingkup (Out of Scope)

- Menghitung kalori makanan menggunakan kamera HP (image recognition gizi/kalori)
- Payment gateway untuk pembayaran jasa PT, termasuk verifikasi pembayaran manual
- GIS — pencarian gym/PT terdekat berbasis lokasi
- Membership tier (bronze, silver, gold, dll.)
- Chat pribadi berkelanjutan antara Klien dan PT (hanya balasan 1x per feedback yang tersedia)
- Pengingat/reminder langsung melalui email

---

## 4. Peran Pengguna

| Role | Cara Akun Dibuat | Akses Utama |
|---|---|---|
| Klien | Registrasi mandiri via Mobile App | Mobile App |
| Personal Trainer (PT) | Dibuat langsung oleh Admin (tanpa registrasi/approval mandiri) | Web Dashboard PT |
| Admin | Dibuat manual saat inisialisasi sistem (seed), tidak ada UI pembuatan | Web Dashboard Admin |

---

## 5. Alur Pengguna (User Flow)

### 5.1 Mobile Klien

1. Buka aplikasi → Login atau Register.
2. Sistem cek kelengkapan profil (BB, TB, target, alergi). Jika kosong, klien diarahkan mengisi form profil terlebih dahulu.
3. Profil lengkap → masuk ke Dashboard (Beranda). Jika belum punya PT, sistem menampilkan ajakan ke tab "PT ku".
4. PT ku: klien melihat rekomendasi PT (difilter berdasarkan tujuan turun/naik BB) → pilih → konfirmasi → kirim request → status pending sampai PT merespons (diterima/ditolak).
5. Progres: sistem menampilkan Weekly Plan AI (di-generate otomatis tiap awal minggu via scheduled job). Klien checklist item olahraga (isi durasi & jarak aktual) atau makanan (preset/custom + porsi); AI menghitung kalori. Klien juga bisa mencatat aktivitas di luar plan.
6. Riwayat: klien melihat rekap kalori masuk vs keluar per hari.
7. Feedback: klien melihat feed gabungan AI (realtime) dan PT (mingguan), dapat membalas 1x per feedback.
8. Profil: klien dapat mengubah data diri, target BB, password, dan tema tampilan kapan saja.
9. Logout.

### 5.2 Web — Personal Trainer

1. Login → diarahkan ke Dashboard PT (jumlah klien, jadwal latihan mingguan hasil AI).
2. Verifikasi: PT meninjau daftar request klien baru → Terima (klien resmi ter-pairing) atau Tolak (wajib isi alasan).
3. Klien: PT memilih klien dari daftar → melihat detail data dan grafik BB historis → meninjau Weekly Plan AI klien tersebut → Setuju (langsung aktif) atau Override (edit manual via form, misalnya karena klien cedera).
4. Riwayat: PT melihat daftar ringkas seluruh kliennya.
5. Feedback: PT memilih klien dari daftar → menulis masukan/semangat → klien menerima notifikasi realtime.
6. Profil: PT dapat mengubah data diri, spesialisasi, password, dan tema.
7. Logout.

### 5.3 Web — Admin

1. Login → diarahkan ke Dashboard Admin (statistik global platform).
2. CRUD User: Admin mengelola data Klien (edit/hapus) dan PT (tambah akun baru secara langsung, edit, hapus). Tidak ada proses approval karena PT tidak mendaftar mandiri.
3. Riwayat: Admin melihat log feedback PT→Klien serta log aktivitas CRUD yang dilakukannya sendiri.
4. Profil: Admin dapat mengubah data diri, password, dan tema.
5. Logout.

> Catatan: Diagram flow visual lengkap (termasuk percabangan Sistem Autentikasi, Verifikasi, dan Review Weekly Plan) tersedia terpisah pada sesi perancangan flow proyek ini.

---

## 6. Desain Basis Data (ERD)

ERD lengkap (14 entitas, format Mermaid) tersedia pada file `bugarin_erd.mermaid`. Ringkasan entitas:

| Entitas | Fungsi |
|---|---|
| `users` | Basis autentikasi seluruh role (email, username, password, role, tema) |
| `klien_profiles` | Data permanen klien: nama, usia, gender, tinggi badan, alergi, PT aktif saat ini |
| `progress_cycles` | Siklus target klien (BB awal, BB tujuan, tujuan, durasi, status) — klien bisa menjalani banyak siklus dari waktu ke waktu |
| `pt_profiles` | Data profil PT: spesialisasi (turun/naik BB), tempat gym (lokasi mengajar) |
| `admin_profiles` | Data profil admin |
| `pairing_requests` | Histori pengajuan klien ke PT (pending/diterima/ditolak) |
| `weight_logs` | Log berat badan berkala klien (sumber data historis untuk PT, AI, dan evaluasi goal) |
| `weekly_plans` | Hasil generate AI (workout_plan termasuk lokasi gym, meal_plan dalam JSON), status pending_review/disetujui/override |
| `master_olahraga` | Data master: jenis olahraga, nilai MET, flag kebutuhan input jarak |
| `master_makanan` | Data master: nama makanan, kalori per 100g (seed atau ai_generated) |
| `activity_logs` | Log olahraga klien, referensi master_olahraga, kalori terbakar terhitung |
| `meal_logs` | Log makanan klien, referensi master_makanan, kalori masuk terhitung |
| `feedbacks` | Feedback dari AI atau PT ke klien, dengan balasan klien (maksimal 1x) |
| `admin_activity_logs` | Audit log aktivitas CRUD yang dilakukan admin |

### 6.1 Business Rules Penting

- **Pairing:** `klien_profiles.pt_id` menyimpan PT aktif saat ini; histori pengajuan tersimpan di `pairing_requests`.
- **Progress Cycle:** target BB klien tidak permanen — disimpan per siklus di `progress_cycles`, bukan di `klien_profiles`. "BB Sekarang" selalu diambil dari entry terakhir `weight_logs` (tiap Simpan = entry baru, bukan overwrite).
- **Deteksi goal tercapai:** otomatis tiap ada `weight_logs` baru — `turun_bb` tercapai jika BB ≤ target, `naik_bb` tercapai jika BB ≥ target. Cycle lalu ditandai `selesai`. `durasi_hari` hanya informasi target waktu, bukan trigger penutupan paksa.
- **Reminder durasi lewat:** jika durasi terlampaui tapi goal belum tercapai, tampilkan banner di Dashboard Klien (di bawah jadwal latihan AI).
- **Mulai siklus baru:** setelah cycle `selesai`, banner di Profil membuka form serupa onboarding (Tujuan, BB Tujuan, Durasi); `bb_awal_kg` baru diambil dari `weight_logs` terakhir.
- **Riwayat per siklus:** satu card per `progress_cycles`, expand untuk lihat log harian dalam rentang tanggal siklus tsb (query berbasis rentang tanggal).
- **Weekly Plan lifecycle:** `pending_review` → `disetujui` (PT klik Setuju) atau `override` (PT edit manual). `workout_plan` menyertakan lokasi dari `pt_profiles.tempat_gym`.
- **Streak (logika OR):** dihitung dari `EXISTS(activity_logs) OR EXISTS(meal_logs)` pada tanggal yang sama — bukan kolom tersendiri.
- **Data Master:** `master_olahraga` di-seed manual (finite list); `master_makanan` dapat tumbuh dinamis saat klien input menu custom yang belum ada (AI generate estimasi kalori, disimpan agar konsisten ke depannya). Pendekatan ini sekaligus menekan risiko AI hallucination pada perhitungan gizi.
- **Feedback:** `balasan_klien` hanya dapat diisi satu kali per baris feedback (bukan chat berkelanjutan).

---

## 7. Tech Stack

| Layer | Pilihan | Catatan |
|---|---|---|
| Web Dashboard (PT + Admin) | Next.js 15 (App Router) + TypeScript | Tailwind CSS + shadcn/ui |
| Data fetching Web | TanStack Query + Axios | Sesuai requirement (Axios) dan reference PBL |
| Mobile | Flutter (Dart) | State management: Riverpod |
| Local cache Mobile | SQLite (drift/sqflite) | Offline resilience |
| Backend | Express.js (Node.js + TypeScript) | Seluruh AI call wajib dieksekusi di sini |
| ORM | Drizzle (`drizzle-orm/mysql2`) | Dipilih karena familiar dari ekosistem TS existing, ringan |
| Validasi | Zod + drizzle-zod | Validasi request body, type inference otomatis dari schema Drizzle |
| Database | MySQL 8 | Wajib requirement, dengan indexing |
| AI | Google Gemini API | Kategori wajib: Generative AI & LLM |
| Scheduled Job | node-cron | Generate Weekly Plan otomatis tiap awal minggu |
| Autentikasi | JWT (diterbitkan Express) | Lihat Bab 8 — Keamanan |
| Notifikasi Realtime | Polling REST | Cukup untuk skala proyek, tanpa infra tambahan |

---

## 8. Keamanan

### 8.1 XSS (Cross-Site Scripting)

- React/Next.js secara default meng-escape seluruh output JSX, sehingga input berbahaya (mis. tag script pada nama makanan custom atau feedback) ditampilkan sebagai teks biasa.
- Aturan tim: tidak pernah menggunakan `dangerouslySetInnerHTML` untuk menampilkan konten dari user atau AI.
- Tambahan Content-Security-Policy header di Next.js sebagai defense-in-depth.

### 8.2 CSRF (Cross-Site Request Forgery)

- Web (PT/Admin): token JWT disimpan di cookie `httpOnly` + `Secure` + `SameSite=Strict/Lax` — imun pencurian token via XSS, dan browser tidak mengirim cookie tersebut pada request lintas situs.
- CORS di Express di-set strict (whitelist origin Next.js, `credentials: true`), tidak menggunakan wildcard.
- Mobile: token disimpan via `flutter_secure_storage` (Keychain/Keystore), dikirim manual lewat header `Authorization: Bearer` — CSRF tidak relevan pada konteks native app.

### 8.3 Hardening Tambahan

- `helmet` middleware di Express untuk set security header standar.
- `express-rate-limit` pada endpoint login/register untuk mencegah brute-force.

### 8.4 Prompt Injection & Data Pribadi

Berdasarkan konfirmasi dosen pengampu, mitigasi prompt injection dan strict output schema formal tidak wajib diterapkan karena Bugarin tidak memiliki fitur chatbot atau percakapan bebas (free-text) ke AI — seluruh input ke Gemini API bersifat terstruktur dan dikendalikan penuh dari backend.

---

## 9. Catatan Tambahan

- Dokumen ini adalah PRD induk yang menjadi acuan untuk penyusunan PRD turunan per role: Frontend, Backend + AI, Mobile, dan UI/UX (menunggu desain final dari Figma).
- File pendamping: `bugarin_erd.mermaid` (diagram ERD), `bugarin_schema_notes.md` (business rules basis data), `bugarin_tech_stack.md` (rincian tech stack).
