# Scripts Deploy (One-Time & Rutin)

Semua dijalankan terhadap database target (Aiven) dengan menyetel `DATABASE_URL`, mis.:

```bash
DATABASE_URL="<connection-string-aiven>" npm run <script>
```

| Script | Kapan dijalankan | Catatan |
|---|---|---|
| `npm run db:migrate` | **setiap ada migration baru** (sebelum deploy versi baru) | buat/ubah tabel dari schema Drizzle |
| `npm run db:seed` | **sekali** (idempotent, aman diulang) | isi `master_olahraga` & `master_makanan`; buat **akun Admin** bila `ADMIN_*` di-set |
| `npm run db:normalize-weekly-plan` | **sekali** (migrasi data lama) | perbaiki `weekly_plans.minggu_mulai` lama ke Senin; idempotent |
| `npm run db:backfill-streak` | **sekali** (migrasi data lama) | isi `progress_cycles.streak` dari histori log |

## Urutan aman (deploy pertama)

```
1. db:migrate
2. db:seed
3. db:normalize-weekly-plan
4. db:backfill-streak
```

## Deploy berikutnya (ada migration baru)

```
1. db:migrate
```

## Catatan

- `db:seed` **tidak menimpa** admin yang sudah ada (reset password admin lewat jalur lain).
- `db:normalize-weekly-plan` & `db:backfill-streak` hanya relevan untuk data yang sudah ada
  sebelum fitur terkait dirilis; aman dijalankan ulang (idempotent).
- Selalu **backup** sebelum `db:migrate` (lihat `rollback.md`).
