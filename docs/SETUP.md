# Bugarin Backend — Setup

## Prasyarat
- Node.js ≥ 20.9 (`nvm use` otomatis baca `.nvmrc`)
- Docker Desktop (untuk MySQL lokal)
- Akun [Aiven](https://aiven.io) & [Render](https://render.com) (untuk deploy, gratis tanpa kartu kredit)

## Setup Lokal

```bash
git clone https://github.com/pbl-semester-3/be-bugarin.git
cd be-bugarin
nvm use
npm install

cp .env.example .env
```

**Isi `.env` yang wajib diganti dari placeholder:**
- `JWT_SECRET` — generate: `openssl rand -base64 32`
- `GEMINI_API_KEY` — ambil dari https://aistudio.google.com/apikey (boleh pakai API key sendiri untuk dev lokal)
- `CRON_SECRET` — string acak bebas, buat lindungi endpoint trigger cron
- `CLOUDINARY_URL` — (opsional) untuk foto profil klien; salin baris "API environment variable" dari dashboard Cloudinary (format `cloudinary://key:secret@cloud_name`). Kalau kosong, endpoint foto mengembalikan 503.
- `GOOGLE_CLIENT_ID` — (opsional) untuk login Google klien; ambil dari Google Cloud Console. Kalau kosong, `POST /auth/oauth/google` mengembalikan 503.
- `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_NAMA` — (opsional) dipakai `npm run db:seed` untuk membuat **akun Admin awal** (Admin tidak bisa self-register). Kalau kosong, seed admin dilewati. Idempotent: admin yang sudah ada tidak ditimpa (reset password admin lewat jalur lain, bukan seed).
- `WEB_ORIGIN` — origin Frontend yang boleh akses API (CORS). Boleh **beberapa dipisah koma** (mis. `http://localhost:3000,https://bugarin.my.id`). Default lokal: `http://localhost:3000`.
- `COOKIE_SAMESITE` — (opsional) atribut SameSite cookie auth web: `lax` (default) / `strict` / `none`. Pakai `none` (butuh HTTPS) **hanya** bila FE & BE beda site (mis. `*.vercel.app` + `*.onrender.com`). Kalau keduanya satu domain (mis. `bugarin.my.id` + `api.bugarin.my.id`), cukup `lax`.
- `DATABASE_URL` — biarkan default kalau pakai `docker compose` (port 3307, sengaja beda dari default 3306 Laragon/MySQL lokal biar tidak bentrok)

```bash
docker compose up -d       # nyalain MySQL lokal, database "bugarin_dev" otomatis kebuat
npm run db:migrate         # bikin semua tabel dari schema Drizzle (migration sudah ke-generate di repo)
npm run db:seed            # isi master_olahraga & master_makanan awal

npm run dev                 # server jalan di http://localhost:4000
```

## Verifikasi Jalan

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nama":"Test","email":"test@test.com","username":"testuser","password":"password123"}'
```
Kalau dapat response `{"data":{"token":"...","role":"klien"}}` — backend beneran nyambung end-to-end (server → DB → hash password → JWT).

**Cek data**: pakai `npx drizzle-kit studio`, atau `docker exec -it bugarin-mysql mysql -u bugarin -pbugarin_dev bugarin_dev`, atau GUI client apa pun (DBeaver/TablePlus/HeidiSQL) ke `localhost:3307`.

## Deployment Dev/Staging (gratis)

> Panduan deploy yang lebih lengkap & terpelihara ada di [`deploy/`](../deploy/README.md)
> (env, runbook, one-time scripts, checklist, rollback). Bagian di bawah ini ringkasan.

Supaya tim Frontend & Mobile **tidak perlu jalanin backend/database apa pun secara lokal**:

### 1. Database — Aiven (MySQL Free Tier)
1. https://aiven.io → daftar tanpa kartu kredit → Create Service → MySQL → plan **Free**.
2. Salin "Service URI" dari dashboard.
3. Jalankan migration + seed ke sana (sekali di awal):
   ```bash
   DATABASE_URL="<connection-string-aiven>" npm run db:migrate
   DATABASE_URL="<connection-string-aiven>" npm run db:seed
   ```

### 2. Backend — Render (Free Web Service)
1. https://render.com → connect ke repo `be-bugarin` di GitHub.
2. New → Web Service → isi semua environment variable dari `.env.example` (pakai `DATABASE_URL` Aiven, bukan yang lokal).
3. Deploy → dapat URL publik, misal `https://bugarin-backend-xxxx.onrender.com`.
4. **Catatan**: free tier "tidur" setelah 15 menit idle, request pertama setelahnya lambat (~30-60 detik cold start). Wajar untuk tahap dev — buka URL-nya beberapa menit sebelum demo ke dosen.

### 3. Cron Weekly Plan — cron-job.org (gratis, eksternal)
Karena Render bisa tidur, `node-cron` di dalam app tidak diandalkan jalan tepat waktu. Endpoint `/internal/jobs/generate-weekly-plan` sudah disiapkan di repo (dilindungi header `x-cron-secret`). Di https://cron-job.org: buat job baru, jadwal tiap Senin 00:00, method POST ke `https://bugarin-backend-xxxx.onrender.com/internal/jobs/generate-weekly-plan`, header `x-cron-secret: <isi CRON_SECRET>`.

### 4. Bagikan URL ke Tim
Setelah live, **share URL Render ini ke tim Frontend & Mobile** — mereka butuh untuk `NEXT_PUBLIC_API_URL` dan `--dart-define=API_URL`. Lihat `SETUP.md` di repo `fe-bugarin`/`mobile-bugarin` masing-masing.

## Struktur Project

```
src/
 ├─ config/     env, db, gemini client
 ├─ db/schema/  14 tabel Drizzle sesuai docs/bugarin_erd.mermaid
 ├─ modules/    auth, klien, pt, admin, master-data, ai
 ├─ middlewares/
 ├─ jobs/       generate-weekly-plan + trigger cron eksternal
 └─ app.ts, server.ts
```

Modul `klien`, `pt`, `admin` baru berisi stub (`/ping`) — implementasikan endpoint lengkap sesuai `docs/Bugarin_PRD_Backend_AI.md` bab 4, ikuti pola di `skills/express-typescript-patterns` (routes → controller → service).
