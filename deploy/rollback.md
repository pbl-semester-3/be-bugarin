# Rollback & Insiden

## Prinsip
- **Backup sebelum migration.** `db:migrate` mengubah skema — jangan jalan tanpa backup.
- Perubahan kode (Render) bisa di-rollback lewat dashboard Render (deploy versi sebelumnya).

## Backup database (Aiven)
- Aiven menyediakan backup otomatis (tergantung plan) — cek dashboard Aiven.
- Manual (mis. via `mysqldump`) sebelum migrasi besar:
  ```bash
  mysqldump --set-gtid-purged=OFF -h <host> -P <port> -u <user> -p <db> > backup-YYYYMMDD.sql
  ```

## Restore database
```bash
mysql -h <host> -P <port> -u <user> -p <db> < backup-YYYYMMDD.sql
```

## Rollback kode (Render)
- Dashboard Render → service → **Deploys** → pilih deploy sehat sebelumnya → **Redeploy**.

## Rollback migration
- Drizzle tidak otomatis membuat migration "down". Bila perlu membatalkan perubahan skema:
  1. Buat migration baru yang membalikkan perubahan (lebih aman & tercatat), atau
  2. Pulihkan dari backup.
- Jangan mengedit migration yang sudah dijalankan secara manual tanpa jejak.

## Saat insiden
1. Cek log Render (service → Logs).
2. Cek status database Aiven (aktif/tidak).
3. Cek `/health`.
4. Bila terkait cookie/login web: cek `COOKIE_SAMESITE` & `WEB_ORIGIN` (lihat `env.md`).
5. Bila terkait foto/OAuth: cek `CLOUDINARY_URL` / `GOOGLE_CLIENT_ID`.
