# Deploy Backend ke Vercel (tanpa kartu)

Alternatif dari Render. Backend Express dijalankan sebagai **Vercel Function**.
Aiven tetap dipakai sebagai database.

## File yang disiapkan di repo

- `api/index.ts` — entry point serverless; membuat app Express dan mengekspornya
  (`export = app` karena `package.json` memakai `"type": "commonjs"`).
- `vercel.json` — mengarahkan **semua** request ke function `api/index.ts`
  (`rewrites`), plus `maxDuration: 60` (Hobby) dan `includeFiles` untuk binary
  native `argon2`.

> Catatan: konfigurasi default framework = **Other** (biarkan apa adanya; Vercel
> mendeteksi folder `api/`). Jangan set Framework Preset ke Next.js.

## Langkah

1. **Import project**: Vercel → Add New → Project → pilih repo `be-bugarin`.
2. **Root Directory**: biarkan root repo. **Framework Preset**: Other.
3. **Build & Output**: biarkan default. (Vercel men-*bundle* `api/index.ts`
   sendiri; `npm run build` tidak wajib untuk function.)
4. **Environment Variables** — set semua dari [`env.md`](./env.md) pada
   environment **Production** (dan Preview bila perlu). Wajib ada minimal:
   `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `CRON_SECRET`,
   `WEB_ORIGIN`, `CLOUDINARY_URL`, `CLOUDINARY_FOLDER`, `GOOGLE_CLIENT_ID`,
   `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, dan `NODE_ENV=production`.
   - `PORT` **tidak perlu** (diatur Vercel).
   - `COOKIE_SAMESITE=lax` (FE & BE satu registrable domain).
5. **Deploy**. Setelah selesai, catat URL `https://<project>.vercel.app`.
6. **Verifikasi**: `GET https://<project>.vercel.app/health` harus `200` JSON.
7. **Custom domain**: Vercel → Project → Settings → Domains → tambahkan
   `api.bugarin.my.id`, lalu buat CNAME di DNS `bugarin.my.id` sesuai instruksi
   Vercel.
8. Set `NEXT_PUBLIC_API_URL=https://api.bugarin.my.id` di FE (Vercel FE).

## Catatan penting (serverless)

- **Cold start**: request pertama setelah idle lebih lambat; normal.
- **Koneksi DB**: pool dibuat per-instance function; Aiven free tier membatasi
  koneksi. Trafik kecil (PBL) aman.
- **Native module `argon2`**: `includeFiles` di `vercel.json` memastikan binary
  ikut ter-*bundle*. Jika tetap error `Cannot find module 'argon2'`, lapor.
- **Endpoint AI yang lama**: `POST /internal/jobs/generate-weekly-plan` dapat
  melewati `maxDuration` (60 dtk) bila banyak klien. Jika itu terjadi, pecah
  per-batch atau pindah ke host container.
- **`trust proxy`** sudah diaktifkan di `src/app.ts`; aman di belakang proxy Vercel.

## Update setelah kode berubah

Push ke branch yang terhubung (mis. `dev`) → Vercel auto-deploy.
