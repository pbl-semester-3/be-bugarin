# PRD Fitur: Profil & Onboarding — Klien

## Metadata

| | |
|---|---|
| **Role** | Klien |
| **Branch** | `feat/profil-onboarding-klien` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.1 |

## Referensi

- `docs/Bugarin_PRD_Backend_AI.md` bab 4.1 (kontrak endpoint klien)
- `docs/Bugarin_PRD_Mobile.md` bab 3.2 (Onboarding), bab 3.8 (Profil)
- `docs/bugarin_erd.mermaid` — tabel `klien_profiles`, `progress_cycles`, `weight_logs`
- `docs/bugarin_schema_notes.md` bab 3 (Progress Cycles & Weight Tracking)
- `skills/drizzle-mysql-patterns` (transaksi, query pattern cek goal tercapai)
- `skills/express-typescript-patterns` (layering routes→controller→service)

## Ringkasan

Fitur fondasi — hampir semua fitur Klien lain (Dashboard, PT ku, Progres) bergantung ke sini. Mencakup pengisian profil pertama kali (Onboarding), edit profil, ganti password/tema, pencatatan berat badan berkala, dan siklus target (progress cycle) termasuk mekanisme mulai siklus baru.

## Endpoint

| Method & Path | Fungsi |
|---|---|
| `GET /klien/profile` | Ambil data profil + cycle aktif (kalau ada) |
| `PUT /klien/profile` | Update data diri (nama, usia, jenisKelamin, alergiMakanan, tinggiBadanCm) |
| `PUT /klien/password` | Ganti password |
| `PUT /klien/theme` | Ganti tema (siang/malam) |
| `POST /klien/weight-logs` | Input BB baru → insert entry + cek goal tercapai |
| `GET /klien/progress-cycles` | List semua siklus (dipakai juga di fitur Riwayat) |
| `POST /klien/progress-cycles` | Mulai siklus baru (Onboarding pertama kali ATAU setelah cycle lama selesai) |

## Business Rules

1. **`GET /klien/profile`** response wajib menyertakan flag `profileComplete` — dihitung dari: `usia`, `jenisKelamin`, `tinggiBadanCm` semua terisi DAN ada `progress_cycles` berstatus `aktif`. Flag ini dipakai Mobile untuk auth guard redirect ke Onboarding (lihat skill `gorouter-navigation-bugarin`).
2. **`PUT /klien/profile`** hanya update field permanen (`klien_profiles`) — tidak menyentuh `progress_cycles`. Field bersifat partial update (field yang tidak dikirim tidak diubah), meski method-nya PUT.
3. **`POST /klien/weight-logs`**: insert entry baru ke `weight_logs`, lalu cek terhadap `progress_cycles` berstatus `aktif` milik klien tsb — kalau `tujuan=turun_bb` dan BB baru ≤ `bb_tujuan_kg`, atau `tujuan=naik_bb` dan BB baru ≥ `bb_tujuan_kg`, update cycle jadi `status=selesai`, `tanggal_selesai=NOW()`.
4. **`POST /klien/progress-cycles`**: dalam 1 transaksi — kalau ada cycle `aktif` sebelumnya, tutup dulu (`status=selesai`, `tanggal_selesai=NOW()`), baru insert cycle baru dengan `bb_awal_kg` = entry `weight_logs` terakhir klien. Kalau ini onboarding pertama kali (belum ada `weight_logs` sama sekali), `bb_awal_kg` diambil dari body request dan langsung di-insert juga sebagai `weight_logs` pertama.
5. Setelah `progress_cycles` baru dibuat, **trigger generate Weekly Plan awal** (panggil `generateWeeklyPlan` dari modul `ai/`) — **hanya kalau klien sudah punya PT** (`klien_profiles.pt_id` tidak null). Kalau belum punya PT, skip — lihat bagian Dependency di bawah.

## Keputusan Desain: `target_kalori_per_hari` (Formula + AI, Hybrid)

Dihitung pakai formula BMR/TDEE (Mifflin-St Jeor), disimpan di `progress_cycles` saat cycle dibuat — deterministik, instan, tidak panggil AI untuk angka ini:

```
BMR (pria)   = 10 × beratBadanKg + 6.25 × tinggiBadanCm - 5 × usia + 5
BMR (wanita) = 10 × beratBadanKg + 6.25 × tinggiBadanCm - 5 × usia - 161

TDEE = BMR × 1.4   (asumsi aktivitas ringan-sedang — Bugarin belum punya field
                     tingkat aktivitas eksplisit; bisa ditambah di iterasi berikutnya
                     kalau butuh presisi lebih)

target_kalori_per_hari = tujuan == 'turun_bb' ? TDEE - 500 : TDEE + 500

Floor keamanan: clamp minimum 1200 kkal (jangan pernah di bawah ini, berapa pun
hasil hitungannya) — mencegah rekomendasi kalori yang tidak sehat.
```

Angka ini lalu **dikirim sebagai constraint ke Gemini API** saat generate Weekly Plan, supaya total estimasi kalori menu yang disusun AI mendekati target ini, bukan angka acak yang tidak nyambung. Implementasi: helper murni di `src/utils/kalori.ts`, dipakai oleh `klien.service.ts` dan diteruskan ke `ai/weekly-plan.ts` (parameter `targetKaloriPerHari`).

## Validasi (Zod)

```
updateProfileSchema: { nama?, usia?, jenisKelamin?, alergiMakanan?, tinggiBadanCm? } — semua optional
changePasswordSchema: { passwordSaatIni: string, passwordBaru: string.min(8) }
changeThemeSchema: { tema: enum(['siang','malam']) }
weightLogSchema: { beratBadanKg: number.positive() }
newCycleSchema: { bbTujuanKg: number.positive(), tujuan: enum(['turun_bb','naik_bb']), durasiHari: number.int().positive() }
```

## Dependency ke Fitur Lain

- **`feat/pt-ku-klien`**: kalau klien belum punya PT saat cycle dibuat, generate Weekly Plan di-skip di sini — `feat/pt-ku-klien` yang bertanggung jawab memanggil `generateWeeklyPlan` begitu pairing request diterima PT.
- **`feat/dashboard-klien`**: bergantung ke `profileComplete` flag dan `progress_cycles` aktif dari fitur ini.
- **`feat/riwayat-klien`**: memakai `GET /klien/progress-cycles` yang diimplementasikan di sini sebagai basis daftar card siklus.

## Definition of Done

- [ ] Semua endpoint di atas terimplementasi sesuai layering `express-typescript-patterns` (routes → controller → service)
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` lolos tanpa error
- [ ] Transaksi di `createProgressCycle` diverifikasi atomik (tutup cycle lama + insert baru tidak bisa nyangkut setengah jalan)
- [ ] Manual test tiap endpoint via Postman (termasuk edge case: onboarding pertama kali vs mulai siklus baru)
- [ ] Work Result ditulis di PR sesuai format `WORKFLOW.md` bab 5