---
name: context7-docs-lookup
description: Gunakan dokumentasi library/framework yang up-to-date lewat Context7 MCP, bukan dari training data, untuk stack Bugarin (Express, Drizzle, Flutter, Gemini API, Next.js). Aktif saat ada pertanyaan setup, referensi API, atau versi library berubah.
metadata:
  origin: bugarin-project
  adapted_from: ECC documentation-lookup (MIT license, https://github.com/affaan-m/ECC)
---

# Context7 Docs Lookup (Bugarin)

Training data punya cutoff tanggal — library yang dipakai Bugarin (Drizzle, Express, Flutter/Riverpod, `@google/generative-ai`, Next.js) terus update API-nya. Skill ini memastikan Claude Code (atau agent lain) mengambil dokumentasi **aktual** lewat Context7 MCP, bukan menebak dari memori training.

## Activation

Aktifkan saat mengerjakan tugas yang menyentuh salah satu library inti Bugarin:

- Setup/konfigurasi (mis. "cara setup drizzle-kit untuk MySQL", "config CORS di Express versi terbaru")
- Kode yang bergantung ke API spesifik library (mis. "tulis migration Drizzle untuk kolom JSON", "panggil Gemini API dengan structured output")
- Error yang kemungkinan disebabkan perubahan API antar versi library
- Menyebut nama library/versi eksplisit ("Drizzle ORM 1.x", "Next.js 15", "Riverpod 3")

Jangan aktifkan untuk logika bisnis murni milik Bugarin sendiri (mis. "hitung streak OR logic") — itu bukan pertanyaan dokumentasi library.

## Cara Kerja

### 1. Resolve Library ID
Panggil tool **resolve-library-id** dengan:
- `libraryName`: nama library (`"Drizzle ORM"`, `"Express"`, `"Google Generative AI"`, `"Flutter Riverpod"`, `"Next.js"`)
- `query`: pertanyaan lengkap task saat ini, supaya hasil resolusi lebih relevan

### 2. Pilih Match Terbaik
- Cocokkan nama persis atau paling dekat.
- Prioritaskan skor benchmark lebih tinggi dan reputasi sumber (High/Medium).
- Kalau versi disebutkan eksplisit (mis. "Next.js 15"), pilih library ID versi tsb kalau tersedia.

### 3. Fetch Dokumentasi
Panggil tool **query-docs** dengan `libraryId` hasil step 2 dan `query` spesifik ke kebutuhan saat ini.

Batas: maksimal 3 panggilan `resolve-library-id`/`query-docs` per pertanyaan. Kalau masih belum jelas setelah 3 kali, nyatakan ketidakpastian dan pakai info terbaik yang ada — jangan mengarang.

### 4. Terapkan ke Kode Bugarin
Gunakan hasil dokumentasi untuk kode yang sesuai konvensi project (lihat skill `express-typescript-patterns` dan `drizzle-mysql-patterns`), bukan copy-paste mentah dari contoh docs yang mungkin beda gaya/struktur folder.

## Contoh Skenario Bugarin

### Setup drizzle-kit untuk MySQL
1. `resolve-library-id` dengan `libraryName: "Drizzle ORM"`, `query: "konfigurasi drizzle-kit untuk MySQL migration"`.
2. Pilih library ID resmi Drizzle.
3. `query-docs` dengan query yang sama.
4. Sesuaikan hasil dengan struktur `db/schema/` project Bugarin.

### Structured output Gemini API
1. `resolve-library-id` dengan `libraryName: "Google Generative AI"`, `query: "structured JSON output dengan responseSchema"`.
2. `query-docs` untuk API terbaru `@google/generative-ai` — perhatikan kalau ada perubahan nama method/parameter dibanding training data.
3. Sesuaikan ke prompt Weekly Plan/feedback di skill `gemini-structured-output`.

### Konfigurasi CORS + cookie credentials di Express
1. `resolve-library-id` dengan `libraryName: "Express"` atau `"cors"` (package spesifik), `query: "cors credentials true dengan cookie httpOnly"`.
2. Validasi pola yang dipakai di skill `jwt-auth-security` masih sesuai versi terbaru package `cors`.

## Best Practices

- Selalu sertakan pertanyaan lengkap (bukan cuma nama library) sebagai `query` — meningkatkan relevansi hasil.
- Kalau ada perbedaan antara dokumentasi terbaru dan pola yang sudah ditulis di skill lain (`drizzle-mysql-patterns`, dst), **prioritaskan dokumentasi terbaru** dan tandai skill lama untuk diperbarui.
- Jangan kirim data sensitif (API key, connection string, password) sebagai bagian dari `query` ke Context7.
- Prefer sumber resmi (repo/organisasi asli package) dibanding fork atau tutorial pihak ketiga saat resolve-library-id menampilkan beberapa opsi.

## Related

- Semua skill lain di folder ini (`express-typescript-patterns`, `drizzle-mysql-patterns`, `jwt-auth-security`, `gemini-structured-output`) — dokumentasi hasil Context7 dipakai untuk memvalidasi/mengupdate pola di dalamnya seiring waktu.
