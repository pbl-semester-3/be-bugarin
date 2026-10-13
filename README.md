# Bugarin Backend

Express + TypeScript + Drizzle ORM + MySQL + Gemini API.

**Sebelum mulai**: baca `Bugarin_PRD_Backend_AI.md`, `bugarin_erd.mermaid`, `bugarin_schema_notes.md`, dan skill di folder `skill/` (kalau sudah ditaruh di sini).

## Setup Cepat

```bash
nvm use
npm install
cp .env.example .env    # isi JWT_SECRET, GEMINI_API_KEY, CRON_SECRET sendiri
docker compose up -d
npm run db:generate     # generate migration dari schema
npm run db:migrate
npm run db:seed
npm run dev              # http://localhost:4000
```

Detail setup lokal: `docs/SETUP.md`. Panduan **deploy** (Render/Aiven/Vercel/cron/OAuth):
folder [`deploy/`](./deploy/README.md).

## Struktur

```
src/
 ├─ config/     env, db, gemini client
 ├─ db/schema/  14 tabel Drizzle sesuai bugarin_erd.mermaid
 ├─ modules/    auth, klien, pt, admin, master-data, ai
 ├─ middlewares/
 ├─ jobs/       generate-weekly-plan + trigger cron eksternal
 └─ app.ts, server.ts
```

Ikuti pola di skill `express-typescript-patterns` (routes → controller → service; jangan query
Drizzle langsung di controller) dan `api-contract-bugarin` (envelope `{ data, meta }`, camelCase).

## Fitur (sudah lengkap)
- **Auth**: register/login/logout klien; OAuth Google (klien); guard JWT (cookie web via
  `X-Client-Type: web`, bearer token mobile); soft-delete (`is_active`) menolak login/sesi.
- **Klien**: profil & onboarding, progres (activity/meal logs), PT ku (pairing), riwayat,
  feedback, dashboard, foto profil.
- **PT**: profil, verifikasi/pairing, klien detail (grafik BB + approve/override weekly plan),
  dashboard, feedback ke klien, riwayat, foto profil.
- **Admin**: profil, CRUD user (+ soft-delete, buat akun PT), dashboard, riwayat.
- **Master data**: `GET /master/olahraga`, `GET /master/makanan?q=`.
- **Jobs**: `POST /internal/jobs/generate-weekly-plan` (dilindungi `x-cron-secret`).

Panduan deploy: [`deploy/`](./deploy/README.md).