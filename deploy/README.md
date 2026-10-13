# Deploy Bugarin Backend

Folder ini berisi aturan & runbook **deployment**. Untuk setup **lokal** (dev), lihat
`docs/SETUP.md`. Dokumen di sini fokus ke lingkungan **dev/staging & production**.

## Arsitektur deploy

| Komponen | Layanan | Contoh |
|---|---|---|
| Backend (Express) | **Render** (Web Service, free) | `https://api.bugarin.my.id` |
| Database | **Aiven** (MySQL free tier) | `DATABASE_URL` |
| Frontend (Web PT & Admin) | **Vercel** | `https://bugarin.my.id` |
| Mobile (Klien) | Flutter (device) | `--dart-define=API_URL=...` |
| Foto profil | **Cloudinary** | `CLOUDINARY_URL` |
| Cron mingguan | **cron-job.org** (eksternal) | `POST /internal/jobs/generate-weekly-plan` |
| Login Google (klien) | **Google Cloud** OAuth | `GOOGLE_CLIENT_ID` |

> **Domain**: FE `bugarin.my.id` dan BE `api.bugarin.my.id` berada di **satu registrable
> domain** → dianggap *same-site* oleh browser → cookie auth web cukup `SameSite=Lax`
> (tidak perlu `None`). Lihat `env.md`.

## Alur deploy singkat

1. Siapkan database Aiven + `DATABASE_URL`.
2. Jalankan `db:migrate` lalu `db:seed` ke Aiven (lihat `scripts.md`).
3. Deploy backend ke Render + set env (lihat `env.md`).
4. Pasang custom domain `api.bugarin.my.id` ke Render.
5. Deploy frontend ke Vercel (`bugarin.my.id`), set `NEXT_PUBLIC_API_URL`.
6. Set Cloudinary & Google OAuth.
7. Daftarkan cron mingguan di cron-job.org.
8. Verifikasi (lihat `runbook.md` langkah terakhir).

## Daftar file

- [`env.md`](./env.md) — semua environment variable.
- [`runbook.md`](./runbook.md) — langkah deploy end-to-end + verifikasi.
- [`scripts.md`](./scripts.md) — one-time scripts (migrate/seed/normalize/backfill).
- [`checklist-demo.md`](./checklist-demo.md) — persiapan sebelum demo.
- [`rollback.md`](./rollback.md) — backup, restore, dan penanganan insiden.

> Jangan pernah commit secret. `.env` gitignored; `.env.example` hanya placeholder.
