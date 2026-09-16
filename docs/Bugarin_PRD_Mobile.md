# Bugarin — PRD Turunan: Mobile (Klien)

Dokumen ini adalah turunan dari `Bugarin_PRD.md` (PRD induk), khusus untuk tim/developer yang mengerjakan Mobile App Klien. Rujuk `bugarin_erd.mermaid` dan `bugarin_schema_notes.md` untuk detail skema data.

---

## 1. Tech Stack Mobile

| Komponen | Pilihan |
|---|---|
| Framework | Flutter (Dart) |
| State management | Riverpod |
| Local cache | SQLite (drift/sqflite) |
| HTTP client | dio atau http + interceptor JWT |
| Penyimpanan token | flutter_secure_storage (Keychain/Keystore) |
| Auth | JWT, header `Authorization: Bearer <token>` |

---

## 2. Struktur Navigasi

```
AuthGate
 ├─ LoginScreen
 ├─ RegisterScreen
 └─ MainShell (setelah login + profil lengkap)
     ├─ Bottom Nav Tab 1: Beranda (Dashboard)
     ├─ Bottom Nav Tab 2: PT ku
     ├─ Bottom Nav Tab 3: Progres (sub-tab: Olahraga | Meal)
     ├─ Bottom Nav Tab 4: Riwayat
     ├─ Bottom Nav Tab 5: Feedback
     └─ Profil (ikon terpisah di pojok atas, bukan bottom nav)
```

**Auth guard logic:**
1. Cek token tersimpan → jika tidak ada, ke `LoginScreen`.
2. Jika ada token → `GET /klien/profile`. Jika profil belum lengkap (usia/tinggi_badan/alergi kosong) atau belum punya `progress_cycles` aktif → arahkan ke `OnboardingScreen` (form isi profil + target awal).
3. Profil & cycle lengkap → masuk `MainShell`.

---

## 3. Spesifikasi Layar

### 3.1 Login / Register
- Login: `email/username` + `password`.
- Register (klien only): `nama`, `email`, `username`, `password`, `konfirmasi_password`.
- Validasi client-side minimal: format email, password ≥ 8 karakter — validasi penuh tetap di backend (Zod).

### 3.2 Onboarding (isi profil pertama kali)
Ditampilkan jika profil/cycle belum lengkap. Form ini **dipakai ulang** nanti saat klien mulai siklus target baru (lihat 3.6).

| Field | Catatan |
|---|---|
| Usia, Jenis Kelamin, Alergi Makanan | Disimpan ke `klien_profiles` |
| Tinggi Badan (cm) | Disimpan ke `klien_profiles` |
| Berat Badan Awal (kg) | Insert pertama ke `weight_logs` + jadi `bb_awal_kg` di `progress_cycles` baru |
| Tujuan (dropdown: Turun BB / Naik BB) | `progress_cycles.tujuan` |
| Berat Badan Tujuan (kg) | `progress_cycles.bb_tujuan_kg` |
| Durasi Progres (hari) | `progress_cycles.durasi_hari` |

Submit → backend hitung `target_kalori_per_hari` (bagian AI/formula), buat `progress_cycles` baru (`status = aktif`), trigger generate Weekly Plan awal (Gemini API).

### 3.3 Dashboard (Beranda)
Referensi: wireframe "BERANDA".

- **Card PT aktif**: foto profil (placeholder), nama PT, spesialisasi. Jika `pt_id` null → tampilkan ajakan ke tab "PT ku", bukan card kosong.
- **Badge target kalori hari ini**: dari `progress_cycles.target_kalori_per_hari`.
- **Badge streak**: hitung dari backend (`activity_logs OR meal_logs` hari ini + berturut-turut ke belakang).
- **Jadwal latihan bareng PT**: dari `weekly_plans.workout_plan` (hari, jam, jenis) + `pt_profiles.tempat_gym` (lokasi). Hanya tampil jika `weekly_plans.status != pending_review` (belum ada plan disetujui → tampilkan state "menunggu PT" atau kosong).
- **Banner reminder**: tampil di bawah jadwal, jika `NOW() > tanggal_mulai + durasi_hari` dan `progress_cycles.status = aktif` (durasi lewat, goal belum tercapai).

### 3.4 PT ku
Referensi: wireframe "PT ku" & "PT ku - Pilih PT".

- Jika belum pernah isi profil/cycle → tampilkan state "Lengkapi profil dulu".
- List rekomendasi PT: `GET /pt/recommendations?tujuan={turun_bb|naik_bb}` (ambil dari `progress_cycles` aktif klien).
- Card PT: foto, nama, spesialisasi.
- Klik card → dialog konfirmasi ("Anda yakin memilih PT ini?") → tombol **Pilih** (kirim `pairing_requests`) atau **Batalkan**.
- Setelah kirim request → tampilkan status "Menunggu konfirmasi PT". Jika ditolak → tampilkan `alasan_penolakan` dan kembalikan ke list rekomendasi.

### 3.5 Progres
Referensi: wireframe "Progres - Olahraga" & "Progres - Meal".

**Tab Olahraga:**
- Tampilkan jadwal latihan dari `weekly_plans.workout_plan` (read-only reference).
- Dropdown jenis olahraga → dari `GET /master/olahraga`.
- Field Durasi (menit) selalu tampil.
- Field Jarak (meter) **hanya tampil kondisional** jika `master_olahraga.butuh_jarak = true` untuk item yang dipilih.
- Submit → `POST /klien/activity-logs` (backend hitung `kalori_terbakar` pakai rumus MET).

**Tab Meal:**
- Tampilkan menu dari `weekly_plans.meal_plan` (read-only reference).
- List preset "Makanan Hari Ini" (Nasi, Ayam, Ikan, Sayur, dst dari `master_makanan` yang ditandai preset) dengan input porsi (gram) per item.
- Baris tambahan: "Ketik Menu Anda" + "Ketik Porsi Anda" — custom entry. Jika nama makanan belum ada di `master_makanan`, backend generate estimasi kalori via AI dan simpan sebagai entry baru (`sumber = ai_generated`).
- Total Kalori dihitung live di UI (sum dari seluruh baris), lalu disimpan lewat `POST /klien/meal-logs` (bisa multiple items dalam satu submit atau per-baris — putuskan saat desain API detail).
- Tombol **Reset** (clear form) dan **Simpan Perubahan**.

### 3.6 Riwayat
Referensi: wireframe "Riwayat" (diperbarui jadi card per siklus, lihat pembahasan Progress Cycle).

- List card per `progress_cycles`, urut terbaru dulu. Cycle `status = aktif` diberi label "Berjalan"; yang `selesai` diberi label tanggal selesai.
- Klik card → expand (accordion/dropdown) menampilkan daily log dalam rentang `tanggal_mulai`–`tanggal_selesai` cycle tsb: tanggal, kalori masuk, kalori keluar.
- Endpoint: `GET /klien/progress-cycles` (list) + `GET /klien/progress-cycles/:id/logs` (detail per cycle saat di-expand — lazy load, jangan fetch semua sekaligus).

### 3.7 Feedback
Referensi: wireframe "Feedback".

- Feed gabungan, urut waktu: bubble AI (ikon AI) dan bubble PT (foto profil PT).
- Badge notifikasi di ikon tab = jumlah feedback dengan `dibaca = false`.
- Field "Ketik Balasan Anda" + tombol **Balas** — **hanya muncul jika `balasan_klien` masih null** untuk feedback tsb. Setelah dibalas, field jadi read-only/hilang untuk feedback itu.

### 3.8 Profil
Referensi: wireframe "Profil".

**Form 1 — Informasi Diri**: Nama, Email, Username, Usia, Jenis Kelamin, Alergi Makanan → `PUT /klien/profile`.

**Form 2 — Detail Penting**:
- Tinggi Badan (cm) → `PUT /klien/profile`.
- Berat Badan Sekarang (kg) → **bukan update field biasa**. Submit ini memanggil `POST /klien/weight-logs` (insert entry baru). Backend otomatis cek goal tercapai setelah insert.
- Tujuan, Tujuan BB, Durasi Progres, Target Kalori per-hari → ditampilkan **read-only** dari `progress_cycles` aktif (tidak diedit langsung di sini, hanya diisi ulang lewat mekanisme siklus baru).
- Progress Bar → dihitung dari `bb_awal_kg` → `bb_sekarang` (weight_logs terakhir) → `bb_tujuan_kg`.
- **Banner "🎉 Target tercapai! Mulai target baru?"** muncul di atas Form 2 jika cycle aktif klien berstatus `selesai`. Klik → buka ulang form Onboarding (3.2) untuk buat `progress_cycles` baru.

**Form 3 — Pengaturan**: Password Saat Ini, Password Baru, Konfirmasi → `PUT /klien/password`.

**Form 4 — Tampilan**: Toggle Malam/Siang → `PUT /klien/theme`.

Setiap form punya tombol Simpan sendiri-sendiri (submit independen, bukan satu submit besar).

---

## 4. Kontrak API (ringkasan)

| Method & Path | Fungsi |
|---|---|
| `POST /auth/register` | Registrasi klien |
| `POST /auth/login` | Login, return JWT |
| `POST /auth/logout` | Logout |
| `GET /klien/profile` | Ambil data profil + cycle aktif |
| `PUT /klien/profile` | Update data diri |
| `PUT /klien/password` | Ganti password |
| `PUT /klien/theme` | Ganti tema |
| `POST /klien/weight-logs` | Input BB baru (insert, trigger cek goal) |
| `GET /klien/progress-cycles` | List semua siklus (untuk Riwayat) |
| `POST /klien/progress-cycles` | Mulai siklus baru |
| `GET /klien/progress-cycles/:id/logs` | Daily log dalam rentang siklus tsb |
| `GET /pt/recommendations?tujuan=` | List rekomendasi PT |
| `POST /klien/pairing-requests` | Kirim request ke PT |
| `GET /klien/pairing-requests/current` | Cek status request aktif |
| `GET /klien/dashboard-summary` | Data agregat Dashboard (PT aktif, kalori, streak, jadwal, reminder) |
| `GET /klien/weekly-plan/current` | Weekly Plan minggu berjalan |
| `GET /master/olahraga` | List master olahraga (dropdown) |
| `GET /master/makanan?q=` | Cari/list master makanan (preset + search custom) |
| `POST /klien/activity-logs` | Catat olahraga |
| `POST /klien/meal-logs` | Catat makanan |
| `GET /klien/feedbacks` | List feed AI + PT |
| `POST /klien/feedbacks/:id/reply` | Balas feedback (1x) |
| `PUT /klien/feedbacks/:id/read` | Tandai sudah dibaca |

> Catatan: ini kontrak awal untuk penyelarasan Mobile ↔ Backend. Detail request/response body (JSON schema) disusun di PRD Backend + AI.

---

## 5. Local Caching (SQLite/drift)

Kandidat data yang di-cache lokal untuk offline resilience:

- `master_olahraga` & `master_makanan` — jarang berubah, sinkron penuh saat app dibuka/refresh, dipakai untuk dropdown/search tanpa perlu network tiap kali.
- `weekly_plan` minggu berjalan — supaya tab Progres tetap bisa dibuka offline (submit log tetap butuh koneksi, tapi lihat plan tidak).
- `dashboard-summary` hasil fetch terakhir — tampilkan versi cache dulu (stale-while-revalidate) sambil fetch ulang di background.

Log yang butuh submit (activity_logs, meal_logs, weight_logs) **tidak** disimpan offline-first di versi awal — cukup tampilkan error/retry kalau gagal kirim, mengingat kompleksitas sync-queue di luar scope PBL.

---

## 6. Validasi & Edge Cases Penting

- Field Jarak di Progres hanya submit-able (required) jika `master_olahraga.butuh_jarak = true` untuk item terpilih — validasi juga di frontend sebelum submit supaya tidak bolak-balik ke backend.
- Balasan feedback: tombol Balas disable/hilang otomatis setelah `balasan_klien` terisi (state dari response API, bukan asumsi lokal).
- Request PT: tombol "Pilih PT" di-disable jika klien masih punya `pairing_requests` berstatus `pending` (cegah double request — validasi utama tetap di backend).
- Progress bar di Profil harus handle kasus `bb_sekarang` melewati `bb_tujuan` (misal progress > 100%) — clamp tampilan di 100% tapi tetap simpan angka asli.
