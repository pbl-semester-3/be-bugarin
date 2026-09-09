# Bugarin — Tech Stack (Final)

Kombinasi baseline requirement kampus (client-server terpisah, MySQL+indexing, REST API, AI backend-driven via Express) dan reference PBL (Next.js, Flutter, TanStack Query, JWT, Gemini API).

## Web Dashboard (PT + Admin)
- **Next.js 16 (App Router) + TypeScript**
- UI: **Tailwind CSS + shadcn/ui**
- Data fetching: **TanStack Query + Axios**

## Mobile (Klien)
- **Flutter (Dart)**
- State management: **Riverpod**
- Local cache: **SQLite** (drift/sqflite) — offline resilience

## Backend
- **Express.js (Node.js + TypeScript)** — wajib: semua AI call dieksekusi di sini, bukan dari klien
- ORM: **Drizzle** (`drizzle-orm/mysql2`) — dipilih karena familiar dari ekosistem TS existing (hmpsti-app), lebih ringan dari Prisma, tanpa masalah kompatibilitas binary/Node version
- Validasi: **Zod** + **drizzle-zod** (generate schema validasi langsung dari schema Drizzle, hemat duplikasi definisi)
- Scheduled job: **node-cron** — generate Weekly Plan AI otomatis tiap awal minggu

## Database
- **MySQL 8**, dengan indexing di kolom FK dan kolom pencarian (nama makanan/olahraga)

## AI
- **Google Gemini API** (kategori wajib: Generative AI & LLM), dipanggil dari backend Express

## Autentikasi & Keamanan
- **JWT**, diterbitkan oleh Express
- **Web**: token disimpan di cookie **httpOnly + Secure + SameSite=Strict/Lax** — imun XSS (JS tidak bisa akses cookie) dan CSRF (browser tidak auto-kirim cookie ke request lintas situs)
- **Mobile**: token disimpan via **flutter_secure_storage** (Keychain/Keystore), dikirim manual lewat header `Authorization: Bearer` — CSRF tidak relevan di konteks native app
- **CORS** di Express: whitelist origin Next.js secara eksplisit, `credentials: true` (bukan wildcard `*`)
- **helmet** middleware — set security header standar otomatis
- **express-rate-limit** — cegah brute-force di endpoint login/register
- Render user-generated content (feedback, nama makanan custom) selalu lewat interpolasi JSX biasa — **tidak pernah** `dangerouslySetInnerHTML`
- Content-Security-Policy header di Next.js sebagai defense-in-depth tambahan

## Notifikasi Realtime (badge feedback)
- **Polling REST** sederhana — cukup untuk skala PBL, tanpa kompleksitas infra tambahan (Socket.io tidak dipakai)

## Di luar scope tech stack ini
- Prompt Engineering Schema formal & mitigasi prompt injection — dikonfirmasi dosen tidak wajib karena Bugarin tidak punya fitur chatbot/free-text conversational ke AI
