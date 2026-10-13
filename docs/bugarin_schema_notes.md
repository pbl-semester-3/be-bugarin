# Bugarin — Database Schema Notes

Dokumen pendamping `bugarin_erd.mermaid`. Berisi business rules penting yang nggak kelihatan cukup jelas dari ERD saja, buat referensi PRD dan tim dev.

## 1. Users & Role

- Satu tabel `users` sebagai basis autentikasi (email, username, password, role).
- Role menentukan tabel profil mana yang terisi: `klien_profiles`, `pt_profiles`, atau `admin_profiles` (relasi 1-1).
- **Klien**: registrasi mandiri lewat mobile app.
- **PT**: **tidak ada registrasi mandiri**. Akun PT dibuat langsung oleh Admin lewat CRUD User (create langsung, tanpa status approval). Setelah akun dibuat, PT wajib melengkapi profil termasuk `tempat_gym` (lokasi mengajar) — field ini dipakai AI untuk menyusun jadwal latihan bareng PT yang tampil di dashboard klien (lihat Bab 4).
- **Admin**: dibuat manual di luar aplikasi (seed/inisialisasi sistem), tidak ada flow pembuatan lewat UI.

## 2. Pairing Klien-PT

- `klien_profiles.pt_id` menyimpan PT yang **sedang aktif** melatih klien tsb (nullable, kosong sebelum klien punya PT).
- `pairing_requests` mencatat histori pengajuan: status `pending` → `diterima` (update `klien_profiles.pt_id`) atau `ditolak` (isi `alasan_penolakan`, `pt_id` klien tetap kosong).
- Klien hanya boleh punya 1 request `pending` aktif dalam satu waktu (validasi di level aplikasi).

## 3. Progress Cycles & Weight Tracking

Target BB klien **tidak permanen seumur akun** — klien bisa menjalani banyak siklus target (misal: berhasil turun BB, lalu lanjut siklus baru naik massa otot). Karena itu, data target dipisah dari `klien_profiles` ke tabel tersendiri `progress_cycles`.

- **Field permanen** tetap di `klien_profiles`: nama, usia, gender, alergi, tinggi badan, PT aktif.
- **Field per-siklus** (`progress_cycles`): `bb_awal_kg` (snapshot BB saat cycle mulai), `bb_tujuan_kg`, `tujuan`, `durasi_hari`, `target_kalori_per_hari`, `status`, `tanggal_mulai`, `tanggal_selesai`.
- **"BB Sekarang"** yang tampil di Profil **bukan kolom statis** — selalu diambil dari entry **terakhir** `weight_logs`. Setiap klien update angka BB di Profil dan klik Simpan, itu insert entry baru ke `weight_logs` (bukan overwrite), sehingga histori BB tetap utuh untuk grafik PT maupun evaluasi goal.
- **Deteksi goal tercapai** (dijalankan tiap ada `weight_logs` baru masuk):
  - `tujuan = turun_bb` → tercapai jika `bb_sekarang ≤ bb_tujuan_kg`
  - `tujuan = naik_bb` → tercapai jika `bb_sekarang ≥ bb_tujuan_kg`
  - Begitu tercapai → `progress_cycles.status` diubah jadi `selesai`, `tanggal_selesai` diisi. `durasi_hari` **bukan** trigger penutupan paksa — hanya informasi target waktu.
- **Reminder durasi lewat**: jika `NOW() > tanggal_mulai + durasi_hari` tapi `status` masih `aktif` (goal belum tercapai), tampilkan banner reminder di Dashboard Klien, di bawah jadwal latihan hasil generate AI.
- **Mulai siklus baru**: setelah `status = selesai`, Profil menampilkan banner ajakan mulai target baru. Klik banner membuka form yang sama seperti form isi profil pertama kali (Tujuan, BB Tujuan, Durasi) — `bb_awal_kg` siklus baru otomatis diambil dari entry terakhir `weight_logs`.
- **Riwayat per siklus**: halaman Riwayat klien menampilkan satu card per `progress_cycles` (mis. "Progres 1", "Progres 2", cycle aktif ditandai "Berjalan"). Card bisa di-expand untuk menampilkan daily log (`activity_logs`/`meal_logs`) yang tanggalnya berada dalam rentang `tanggal_mulai`–`tanggal_selesai` cycle tsb (query berbasis rentang tanggal, tidak perlu FK tambahan di tabel log).

## 4. Weekly Plan AI

- Digenerate otomatis oleh scheduled job (cron, tiap awal minggu) berdasarkan `klien_profiles` (alergi, tinggi badan) + `progress_cycles` aktif (BB awal, target, tujuan) + histori `weight_logs`/`activity_logs`/`meal_logs`.
- `workout_plan` (JSON) menyertakan **lokasi** latihan, diambil dari `pt_profiles.tempat_gym` milik PT klien tsb — ini yang membuat jadwal di dashboard klien bisa menampilkan lokasi (mis. "Senin 16.00 UpperBody, Lokasi: GYM Fithub"), bukan cuma jadwal waktu.
- Status lifecycle: `pending_review` (baru digenerate) → `disetujui` (PT klik Setuju) atau `override` (PT edit manual, misal karena cedera).
- `workout_plan` dan `meal_plan` disimpan sebagai JSON supaya fleksibel terhadap perubahan struktur AI generatif.

## 5. Data Master (`master_makanan`, `master_olahraga`)

Ditambahkan untuk memenuhi baseline requirement kampus (wajib ada kategori Tabel Data Master) sekaligus menambal risiko **AI hallucination** pada perhitungan gizi/kalori.

- **`master_olahraga`**: seed manual oleh dev (finite list, dipakai sebagai dropdown di UI). Menyimpan `met_value` (Metabolic Equivalent of Task) untuk rumus baku: `kalori_terbakar = met_value × berat_badan_kg × (durasi_menit / 60)`. Field `butuh_jarak` menentukan apakah input jarak muncul di form (lari, jalan, renang, triatlon) — logika ini jadi data-driven, bukan hardcode di frontend.
- **`master_makanan`**: di-seed sebagian (Nasi, Ayam, Ikan, Sayur, dst — item preset di UI "Makanan Hari Ini"), tapi bisa **tumbuh dinamis**: kalau klien ketik menu custom yang belum ada, AI generate estimasi kalori/100g-nya lalu disimpan sebagai entry baru (`sumber = ai_generated`) supaya konsisten dipakai lagi ke depannya, bukan ditebak ulang tiap kali. Rumus: `kalori_masuk = kalori_per_100g × (porsi_gram / 100)`.

## 6. Activity & Meal Logs

- `olahraga_id` / `makanan_id` mereferensi tabel master (bukan string bebas lagi) → hasil kalori konsisten & bisa di-index.
- `weekly_plan_id` nullable: diisi kalau log berasal dari item plan (checklist), kosong kalau klien input manual di luar plan.
- `kalori_terbakar` dan `kalori_masuk` dihitung backend pakai rumus dari data master saat insert (snapshot, disimpan permanen walau data master berubah nanti) — bukan tebakan AI mentah tiap kali.
- `jarak_meter` nullable, tampil di UI kalau `master_olahraga.butuh_jarak = true`.

## 7. Streak Logic (OR, Akumulatif per Siklus)

- Streak di dashboard klien **disimpan persisten** di kolom `progress_cycles.streak` (revisi 2026-10-02; bukan lagi dihitung on-read).
- Nilainya = jumlah **hari unik** (`DISTINCT tanggal`)yang memenuhi `EXISTS(activity_logs WHERE tanggal = X) OR EXISTS(meal_logs WHERE tanggal = X)`, dibatasi pada window siklus (`tanggal_mulai` s.d. `tanggal_selesai`/hari ini).
- Streak **akumulatif dan tidak pernah reset** selama siklus berjalan: hari tanpa log membuat nilai beku, dan saat klien log lagi nilainya dilanjutkan dari angka terakhir. Reset hanya terjadi saat klien memulai siklus baru (mulai dari 0).
- Klien hanya input makanan tanpa olahraga di hari itu → tetap dihitung +1 (logika OR).
- Update realtime saat insert `activity_logs`/`meal_logs`; backfill data lama lewat `npm run db:backfill-streak`. Detail: `CATATAN.md`.

## 8. Feedback

- Satu baris `feedbacks` bisa berasal dari AI (`source = ai`, `pt_id` null, realtime tiap update progres) atau dari PT (`source = pt`, mingguan).
- `balasan_klien` hanya boleh diisi **sekali** per baris feedback (bukan chat berkelanjutan) — divalidasi di level aplikasi (field jadi read-only setelah terisi).
- `dibaca` dipakai untuk badge notifikasi realtime di kedua sisi (klien lihat feedback baru, PT lihat balasan baru).

## 9. Admin Activity Log

- Merekap 2 jenis histori sesuai fitur "Riwayat" Admin:
  1. Aktivitas CRUD yang dilakukan admin sendiri (create/edit/delete user) → `admin_activity_logs`.
  2. Aktivitas PT memberi feedback ke klien → cukup query dari tabel `feedbacks WHERE source = 'pt'`, nggak perlu tabel terpisah.

## 10. Out of Scope (tidak perlu tabel)

Karena sudah difinalkan out-of-scope, sengaja **tidak ada** tabel untuk: payment/transaksi, kamera kalori (image recognition), GIS/lokasi gym pencarian, membership tier, chat berkelanjutan.
