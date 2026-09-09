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

Detail lengkap (termasuk deploy ke Render/Aiven) ada di `docs/SETUP.md`.

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

Modul `klien`, `pt`, `admin` baru berisi stub (`/ping`) — implementasikan endpoint lengkap
sesuai `Bugarin_PRD_Backend_AI.md` bab 4, ikuti pola di skill `express-typescript-patterns`
(routes → controller → service, jangan query Drizzle langsung di controller).

## Yang Sudah Jalan
- `POST /auth/register`, `/auth/login`, `/auth/logout` (khusus klien untuk register)
- `GET /master/olahraga`, `/master/makanan?q=`
- `POST /internal/jobs/generate-weekly-plan` (dilindungi header `x-cron-secret`)
- Auth guard JWT (cookie untuk web via header `X-Client-Type: web`, bearer token untuk mobile)