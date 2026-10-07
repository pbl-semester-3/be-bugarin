# Catatan Perubahan Logic Streak (Dashboard Klien)

- **Tanggal**: 2026-10-02
- **Branch**: `feat/dashboard-klien`
- **Status**: Implementasi (belum di-commit)
- **Konteks**: Revisi setelah review PRD. Logic streak awal (current/consecutive streak
  yang reset ke 0 saat ada gap) digantikan dengan streak **accumulated per siklus** yang
  **tidak pernah reset** selama siklus berjalan.

Dokumen ini adalah pengingat logic. Jika di kemudian hari perilaku streak dipertanyakan,
rujuk catatan ini.

## Ringkasan Perubahan Logic

| | Logic Lama | Logic Baru |
|---|---|---|
| Arti | Hari berturut-turut sampai hari ini | Total hari unik ber-log dalam satu siklus |
| Gap (tidak log sehari) | Reset ke 0 | Nilai beku, tidak berubah |
| Mulai log lagi setelah gap | Mulai dari 1 | Lanjut dari angka terakhir |
| Batas | Sepanjang histori (on-read) | Window siklus aktif (`progress_cycles.tanggal_mulai` s.d. selesai) |
| Reset | Tidak ada reset eksplisit | Reset saat klien memulai siklus baru |
| Penyimpanan | Dihitung on-read | Persisten: kolom `progress_cycles.streak` |
| Update | Saat GET dashboard | Realtime saat insert `activity_logs` / `meal_logs` |

## Definisi Final

`streak` = jumlah **hari unik** (`DISTINCT tanggal`) yang memiliki minimal 1 baris
`activity_logs` **ATAU** `meal_logs` (logika OR per tanggal), dibatasi pada window siklus:
`tanggal >= progress_cycles.tanggal_mulai` dan `tanggal <= progress_cycles.tanggal_selesai`
(bila siklus selesai; bila masih aktif pakai tanggal hari ini).

- Satu hari dengan activity + meal sekaligus tetap dihitung **+1**.
- Tidak ada siklus aktif -> dashboard mengembalikan `streak: 0`.
- Nilai ini nantinya dibandingkan dengan total hari target (`progress_cycles.durasi_hari`).

## Cara Update

Di-update **realtime** setiap `POST /klien/activity-logs` dan `POST /klien/meal-logs`:

1. Cari `progress_cycles` dengan `status = 'aktif'` milik klien.
2. Hitung `COUNT(DISTINCT tanggal)` dari union `activity_logs` + `meal_logs` dalam window siklus.
3. Simpan hasilnya ke `progress_cycles.streak`.

Memakai recompute (bukan increment manual) agar idempotent dan aman dari double-count saat
activity + meal di hari yang sama atau request paralel. Helper: `recalculateActiveCycleStreak()`
di `src/modules/klien/klien.service.ts`.

Dashboard (`GET /klien/dashboard-summary`) cukup membaca `activeCycle.streak`.

## File yang Diubah

| File | Perubahan |
|---|---|
| `src/db/schema/progress-cycles.ts` | Tambah kolom `streak int not null default 0`. |
| `src/db/migrations/0001_*.sql` | Migration hasil `npm run db:generate` (kolom baru). |
| `scripts/backfill-streak.ts` | Backfill satu kali: hitung ulang `streak` tiap cycle dari log historis. |
| `package.json` | Tambah script `db:backfill-streak`. |
| `src/modules/klien/klien.service.ts` | Helper `recalculateActiveCycleStreak()`; panggil di `createActivityLog()` & `createMealLog()`; `getDashboardSummary()` baca kolom; hapus logic Set/loop streak lama. |
| `fitur/klien/PRD-dashboard-klien.md` | Tulis ulang bab Streak, edge case, dan jawab Open Question performa. |
| `fitur/klien/PRD-progres-klien.md` | Koreksi pernyataan "insert log tidak trigger recalc streak". |
| `docs/bugarin_schema_notes.md` | Update definisi streak (per siklus, persisten). |
| `tests/integration/test-dashboard-klien.ts` | Revisi skenario gap/reset + tambah skenario lanjut setelah gap & reset siklus baru. |
| `tests/integration/test-progres-klien.ts` | Tambah verifikasi streak naik saat insert log. |

## Catatan Penting

- Fitur feedback AI tetap **independen** dari streak (lihat `PRD-feedback-klien.md`).
- Wajib jalankan migration (`npm run db:migrate`) lalu backfill (`npm run db:backfill-streak`)
  sekali saat deploy.
- Logic streak lama yang menghitung on-read (in-memory Set + loop mundur) sudah dihapus dari
  `getDashboardSummary()`.
