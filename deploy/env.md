# Environment Variables (Deploy)

Set semua ini di dashboard **Render** (atau environment provider). Jangan commit nilai asli —
hanya placeholder di `.env.example`.

## Wajib

| Variabel | Contoh / Catatan |
|---|---|
| `DATABASE_URL` | Connection string Aiven: `mysql://user:pass@host:port/db?ssl-mode=REQUIRED` |
| `JWT_SECRET` | String acak ≥ 32 karakter (`openssl rand -base64 32`) |
| `GEMINI_API_KEY` | Dari https://aistudio.google.com/apikey |
| `CRON_SECRET` | String acak; dipakai header `x-cron-secret` pada `/internal/jobs/*` |
| `WEB_ORIGIN` | Origin FE yang boleh akses API (CORS). **Boleh beberapa, dipisah koma.** Contoh: `https://bugarin.my.id` |
| `NODE_ENV` | `production` |
| `PORT` | Render mengisi otomatis; default `4000` |

## Opsional

| Variabel | Catatan |
|---|---|
| `COOKIE_SAMESITE` | `lax` (default) / `strict` / `none`. Lihat bagian "Cookie" di bawah. |
| `CLOUDINARY_URL` | `cloudinary://<api_key>:<api_secret>@<cloud_name>`. Kosong → endpoint foto 503. |
| `CLOUDINARY_FOLDER` | Folder Cloudinary (mis. `bugarin`). |
| `GOOGLE_CLIENT_ID` | Client ID **Web** dari Google Cloud (audience ID token). Kosong → OAuth Google 503. |
| `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_NAMA` | Dipakai `npm run db:seed` untuk membuat akun Admin awal. Kosong → seed admin dilewati. |

## Cookie (SameSite) & domain

`COOKIE_SAMESITE` mengatur cookie auth **web** (PT & Admin). Mobile memakai Bearer token (tak terpengaruh).

- **Rekomendasi (custom domain, satu site)**: FE `https://bugarin.my.id` + BE `https://api.bugarin.my.id`
  → satu registrable domain (`bugarin.my.id`) → cukup **`COOKIE_SAMESITE=lax`**.
- **Bila FE & BE beda site** (mis. `*.vercel.app` + `*.onrender.com`): set **`COOKIE_SAMESITE=none`**
  (otomatis `Secure`; wajib HTTPS).

`WEB_ORIGIN` harus memuat origin FE persis (skema + host, tanpa trailing slash). Bila ada
preview Vercel, tambahkan sebagai daftar dipisah koma.
