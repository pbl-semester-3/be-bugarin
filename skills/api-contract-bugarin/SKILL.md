---
name: api-contract-bugarin
description: Konvensi bentuk request/response, penamaan endpoint, dan format error yang konsisten antara Backend, Mobile, dan Frontend Bugarin. Gunakan saat menambah endpoint baru atau saat frontend/mobile mengintegrasikan API.
metadata:
  origin: bugarin-project
  adapted_from: ECC contract-first, api-design (MIT license, https://github.com/affaan-m/ECC)
---

# API Contract Bugarin

Bugarin punya 3 konsumen (Mobile Klien, Web PT, Web Admin) dan 1 provider (Backend Express). Skill ini adalah "kontrak ringan" — bukan OpenAPI penuh (di luar scope PBL), tapi aturan konsisten yang wajib dipatuhi supaya ketiga tim (mobile/frontend/backend) tidak saling menebak bentuk data.

Referensi lengkap daftar endpoint ada di `Bugarin_PRD_Backend_AI.md` bab 4. Skill ini mengatur **bentuk**-nya, bukan daftar endpoint-nya.

## Activation

- Menambah endpoint baru di backend.
- Mengintegrasikan endpoint dari sisi Mobile (Flutter) atau Frontend (Next.js).
- Ada perbedaan pendapat antar-role soal bentuk response — kembali ke skill ini sebagai acuan.

## Penamaan Endpoint

- Kebab-case, plural untuk resource: `/klien/weight-logs`, bukan `/klien/weightLog`.
- Prefix path pertama = konteks role: `/klien/*`, `/pt/*`, `/admin/*`, `/master/*`, `/auth/*`.
- Action non-CRUD pakai sub-path kata kerja, bukan query param: `/pt/weekly-plan/:id/approve`, bukan `/pt/weekly-plan/:id?action=approve`.

## Bentuk Response — Selalu Dibungkus Envelope

**Sukses:**
```json
{ "data": { ... } }
```
List/koleksi:
```json
{ "data": [ ... ], "meta": { "total": 42 } }
```

**Error** (format tunggal untuk semua jenis error, dari `error-handler.ts` di skill `express-typescript-patterns`):
```json
{ "error": "PT tidak ditemukan" }
```
Error validasi (Zod) punya bentuk lebih detail:
```json
{ "error": { "fields": { "email": ["Format email tidak valid"] } } }
```

Konsumen (Mobile/Frontend) selalu cek keberadaan key `data` vs `error`, jangan asumsikan dari HTTP status code saja.

## Konvensi Field

- Semua nama field response **camelCase** di JSON (`bbTujuanKg`, bukan `bb_tujuan_kg`) walau di database snake_case — konversi ini tanggung jawab layer service/controller, bukan diserahkan ke konsumen.
- Tanggal/waktu selalu **ISO 8601 UTC string** (`"2026-09-05T10:00:00.000Z"`), konversi timezone lokal dilakukan di klien (Mobile/Web), bukan backend.
- ID selalu **number**, bukan string, kecuali disepakati lain untuk kasus tertentu (Bugarin belum ada kebutuhan UUID/bigint-as-string).
- Field yang secara desain boleh kosong = `null` eksplisit, bukan key yang hilang dari objek. Contoh: `pairing_requests.alasan_penolakan` harus tampil sebagai `alasanPenolakan: null` saat status `diterima`, bukan field yang tidak ada.
- Enum dikirim sebagai string persis seperti di database (`"turun_bb"`, `"pending_review"`), konsumen yang menerjemahkan ke label UI ("Turun BB", "Menunggu Review").

## Contoh Kontrak Konkret (untuk disepakati sebelum implementasi paralel)

```typescript
// GET /klien/dashboard-summary → { data: DashboardSummary }
type DashboardSummary = {
  pt: { nama: string; spesialisasi: "turun_bb" | "naik_bb" } | null; // null = belum punya PT
  targetKaloriHariIni: number;
  streakHari: number;
  jadwalMingguIni: Array<{ hari: string; jam: string; jenis: string; lokasi: string }>;
  reminderDurasiLewat: boolean;
};
```

Definisikan tipe seperti ini **sekali** di backend (`modules/klien/klien.types.ts`), lalu Mobile/Frontend membuat tipe Dart/TypeScript yang **menyalin bentuk yang sama** secara manual (karena tidak pakai code-gen OpenAPI di scope PBL ini). Kalau bentuk berubah di backend, developer backend **wajib** memberi tahu tim lain sebelum merge — jangan ubah bentuk response diam-diam.

## Perubahan Kontrak (Protokol)

1. Diskusikan kebutuhan konsumen dulu (Mobile/Frontend butuh field apa) sebelum backend implementasi.
2. Backend ubah bentuk response.
3. Update tipe di dokumen ini / `Bugarin_PRD_Backend_AI.md` kalau bentuknya signifikan berubah.
4. Kabari tim lain (chat grup/PR description) sebelum merge — jangan biarkan mereka baru tahu saat integrasi gagal.
5. Perubahan yang **menghapus/mengganti nama field lama** (breaking) harus dikoordinasikan waktu mergenya, bukan asumsi konsumen langsung update bersamaan.

## Anti-Patterns

| Anti-Pattern | Risiko | Perbaikan |
|---|---|---|
| Return raw row Drizzle langsung (`snake_case`, field internal ikut terekspos) | Konsumen dapat field yang tidak seharusnya publik, penamaan tidak konsisten | Mapping eksplisit ke response type di controller/service |
| Field hilang saat null (`delete obj.alasan`) | Konsumen crash saat destructuring/`undefined` di Dart | Selalu set `null` eksplisit |
| Ubah bentuk response tanpa kabar-kabar | Mobile/Frontend tiba-tiba error di integrasi | Ikuti protokol perubahan kontrak di atas |
| Mixing status code (200 dengan body `{error: ...}`) | Konsumen bingung, retry logic salah | Status code dan bentuk body harus konsisten (4xx/5xx = ada key `error`) |

## Related

- Skill: `express-typescript-patterns` — tempat mapping response dilakukan (controller layer)
- Skill: `jwt-auth-security` — format error 401/403 mengikuti aturan yang sama
