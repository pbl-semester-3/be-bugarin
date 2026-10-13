# Runbook Deploy

Urutan langkah dari nol sampai live. Ganti nilai contoh dengan milik Anda.

## 1. Database — Aiven (MySQL free tier)

1. https://aiven.io → daftar (tanpa kartu kredit) → Create Service → MySQL → plan **Free**.
2. Salin "Service URI" → jadi `DATABASE_URL`.
3. Aiven bisa "tidur" saat idle; power on dari dashboard bila perlu.

## 2. Migrasi + seed ke Aiven (sekali / saat ada migration baru)

```bash
DATABASE_URL="<connection-string-aiven>" npm run db:migrate
DATABASE_URL="<connection-string-aiven>" npm run db:seed
```

- `db:seed` idempotent; juga membuat **akun Admin awal** bila `ADMIN_*` di-set.
- Urutan & script lain: lihat `scripts.md`.

## 3. Backend — Render (Web Service, free)

**Cara cepat (Blueprint)**: Render → New → **Blueprint** → pilih repo ini → Render membaca
`render.yaml` (build/start/health check + env). Isi nilai bertanda `sync: false` di dashboard.

**Cara manual**:
1. https://render.com → connect repo GitHub backend.
2. New → Web Service → pilih repo (Render auto-detect Node).
3. Build Command: `npm install --include=dev && npm run build`
   > `--include=dev` WAJIB: karena `NODE_ENV=production`, npm melewatkan devDependencies →
     `tsc` tidak ada → build gagal.
4. Start Command: `npm start`
5. Set semua env dari `env.md` (termasuk `DATABASE_URL` Aiven, `NODE_ENV=production`).
6. Deploy → dapat URL (`https://<nama>.onrender.com`).

> `render.yaml` di-set ke branch `dev` (staging). Untuk production, ubah ke `main`.

> Free tier "tidur" setelah ~15 menit idle; request pertama lambat (cold start ~30-60 dtk).

## 4. Custom domain backend — `api.bugarin.my.id`

1. Di Render: Settings → Custom Domain → tambah `api.bugarin.my.id`.
2. Di DNS `bugarin.my.id`: tambah record **CNAME** `api` → target dari Render.
3. Tunggu propagasi + SSL otomatis.

> Tujuan: FE (`bugarin.my.id`) & BE (`api.bugarin.my.id`) **satu site** → cookie cukup `SameSite=Lax`.

## 5. Frontend — Vercel

1. Connect repo frontend ke Vercel → Import.
2. Set env: `NEXT_PUBLIC_API_URL=https://api.bugarin.my.id`.
3. Domain: `bugarin.my.id`.
4. Tambahkan domain FE ini ke `WEB_ORIGIN` backend.

## 6. Cloudinary (foto profil)

- Set `CLOUDINARY_URL` (+ opsional `CLOUDINARY_FOLDER`) di Render.
- Tanpa ini, endpoint foto mengembalikan 503 (app tetap jalan).

## 7. Google OAuth (login klien)

- Buat **Web client ID** di Google Cloud → set `GOOGLE_CLIENT_ID` di Render.
- Mobile: set `serverClientId` = Web client ID yang sama.

## 8. Cron mingguan — cron-job.org

- Buat job: `POST https://api.bugarin.my.id/internal/jobs/generate-weekly-plan`
- Header: `x-cron-secret: <CRON_SECRET>`
- Jadwal: setiap **Senin 00:00**.

## 9. Verifikasi

```bash
curl https://api.bugarin.my.id/health          # -> {"data":"ok"}
```

- Login akun Admin hasil seed (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) dari web.
- Buat akun PT dari web Admin → login PT.
- Cek dashboard PT & klien terisi.
- Upload foto profil (butuh Cloudinary).
