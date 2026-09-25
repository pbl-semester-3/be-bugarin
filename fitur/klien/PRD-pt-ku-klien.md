# PRD Fitur: PT Ku — Klien

## Metadata

| | |
|---|---|
| **Role** | Klien (konsumen), PT (sisi terima/tolak — diimplementasikan di branch PT) |
| **Branch** | `feat/pt-ku-klien` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.1 & 4.2 |

## Referensi

- `docs/Bugarin_PRD_Backend_AI.md` bab 4.1 (endpoint klien: pairing-requests, rekomendasi PT) dan 4.2 (endpoint PT: pairing-requests terima/tolak)
- `docs/Bugarin_PRD.md` bab 3.1 (Fitur Mobile — PT ku) dan 3.2 (Fitur Web — PT: Verifikasi)
- `docs/bugarin_erd.mermaid` — tabel `pairing_requests`, `klien_profiles`, `pt_profiles`
- `docs/bugarin_schema_notes.md` bab 2 (Pairing Klien-PT)
- `skills/drizzle-mysql-patterns` (query patterns, indexing `pairing_requests`)
- `skills/express-typescript-patterns` (layering routes → controller → service)
- `skills/api-contract-bugarin` (konvensi response envelope, field camelCase)
- `fitur/klien/PRD-profil-onboarding-klien.md` — dependency: fitur ini bergantung ke `profileComplete` dan `progress_cycles` aktif

---

## Ringkasan

Fitur **PT Ku** adalah mekanisme di mana klien mencari dan memilih Personal Trainer yang sesuai dengan tujuan kebugarannya. Alurnya: klien melihat daftar rekomendasi PT → memilih satu → mengirim pairing request → menunggu respons PT (terima/tolak).

Fitur ini adalah **jembatan kritis** antara klien dan PT: begitu request diterima, sistem meng-update `klien_profiles.pt_id` (klien sekarang punya PT aktif) dan men-trigger generate Weekly Plan pertama untuk klien tersebut — dua efek samping yang tidak boleh terlewat.

Sisi **terima/tolak dari PT** (`PUT /pt/pairing-requests/:id`) diimplementasikan dalam scope branch yang sama (`feat/pt-ku-klien`) karena kedua sisi membentuk satu alur yang utuh dan harus bisa ditest end-to-end sekaligus.

---

## Endpoint

### Sisi Klien

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /pt/recommendations` | Klien | List PT yang bisa dipilih, difilter berdasarkan `tujuan` cycle aktif klien |
| `POST /klien/pairing-requests` | Klien | Kirim request ke PT yang dipilih |
| `GET /klien/pairing-requests/current` | Klien | Status request aktif milik klien saat ini |

### Sisi PT (diimplementasikan dalam branch yang sama)

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /pt/pairing-requests` | PT | List request pending yang masuk ke PT ini |
| `PUT /pt/pairing-requests/:id` | PT | Terima (tanpa body) atau Tolak (body: `alasanPenolakan`) |

---

## Business Rules

### 1. Filter Rekomendasi PT (`GET /pt/recommendations`)

- Query parameter `tujuan` (`turun_bb` | `naik_bb`) bersifat **opsional di URL** tapi diambil otomatis dari cycle aktif klien yang login — klien tidak perlu input manual.
- Filter: `pt_profiles.spesialisasi = tujuan_cycle_aktif_klien`.
- PT yang **sudah menjadi PT aktif klien ini** (`klien_profiles.pt_id = pt.id`) **tidak ditampilkan** — tidak ada gunanya request ke PT yang sudah aktif.
- Jika klien belum punya cycle aktif (profil belum lengkap), endpoint ini mengembalikan **HTTP 422** dengan pesan `"Lengkapi profil dan buat siklus target terlebih dahulu"` — tidak menampilkan daftar kosong yang membingungkan.
- PT yang `tempat_gym`-nya masih null (belum lengkapi profil) **tidak ditampilkan** — karena lokasi gym ini dibutuhkan untuk AI Weekly Plan nantinya.

### 2. Kirim Request (`POST /klien/pairing-requests`)

- Klien hanya boleh punya **1 request `pending` aktif** dalam satu waktu. Jika sudah ada → HTTP 409 dengan pesan `"Kamu sudah punya request yang sedang menunggu. Batalkan atau tunggu responsnya."`.
- Klien **tidak bisa** request ke PT yang sudah menjadi PT aktifnya (`klien_profiles.pt_id` sudah terisi dengan PT yang sama) → HTTP 409.
- Validasi: `ptId` di body harus merujuk ke PT yang benar-benar ada → HTTP 404 jika tidak ada.
- Insert ke `pairing_requests` dengan status default `pending`.
- **Tidak ada** logika auto-reject request lama — klien hanya bisa punya 1 pending, jadi tidak perlu.

### 3. Status Request Aktif (`GET /klien/pairing-requests/current`)

- Kembalikan request terakhir milik klien (urut by `created_at DESC`, limit 1).
- Jika tidak ada request sama sekali → `data: null` (bukan 404).
- Response mencakup status request (`pending` / `diterima` / `ditolak`), nama PT, dan `alasanPenolakan` (null jika status bukan `ditolak`).

### 4. List Request Pending untuk PT (`GET /pt/pairing-requests`)

- Hanya kembalikan request dengan `status = "pending"` yang `pt_id`-nya adalah PT yang sedang login.
- Sertakan data ringkas klien yang request: nama, tanggal request, dan tujuan cycle aktif (null jika belum ada cycle).

### 5. Terima/Tolak Request (`PUT /pt/pairing-requests/:id`)

- PT hanya boleh merespons request yang `pt_id`-nya cocok dengan dirinya → HTTP 403 jika tidak.
- Request yang sudah `diterima` atau `ditolak` **tidak bisa diubah lagi** → HTTP 409 `"Request ini sudah direspons."`.

#### Jika **Terima** (body kosong / tidak ada field `alasanPenolakan`):

Dalam **1 transaksi atomik**:

1. Update `pairing_requests.status = "diterima"`.
2. Update `klien_profiles.pt_id = ptId` (klien sekarang punya PT aktif).

Setelah transaksi selesai (di luar transaksi):

3. **Trigger generate Weekly Plan** untuk klien tersebut — panggil `generateWeeklyPlan()` dari modul `ai/` secara **fire-and-forget** (tidak memakai `await` di jalur utama response, cukup `.catch()` untuk log error). Jika generate gagal, plan bisa di-generate ulang oleh cron job minggu berikutnya.

#### Jika **Tolak** (body mengandung `alasanPenolakan`):

1. Validasi: `alasanPenolakan` wajib diisi, tidak boleh string kosong → HTTP 400.
2. Update `pairing_requests.status = "ditolak"`, `alasan_penolakan = alasanPenolakan`.
3. `klien_profiles.pt_id` **tidak berubah** (klien tetap tanpa PT aktif).

---

## Skema Data yang Dipakai (Tidak Ada Perubahan Schema)

Semua tabel yang dipakai sudah ada. Tidak ada migration baru yang diperlukan.

```
pairing_requests  (sudah ada)
  id              INT PK
  klien_id        FK → klien_profiles.id  [INDEX sudah ada]
  pt_id           FK → pt_profiles.id     [INDEX sudah ada]
  status          ENUM('pending','diterima','ditolak')  DEFAULT 'pending'
  alasan_penolakan TEXT nullable
  created_at      TIMESTAMP

klien_profiles    (sudah ada)
  pt_id           FK nullable → pt_profiles.id   ← yang di-update saat diterima

pt_profiles       (sudah ada)
  spesialisasi    ENUM('turun_bb','naik_bb')      ← basis filter rekomendasi
  tempat_gym      VARCHAR(150) nullable            ← harus terisi agar PT muncul di rekomendasi
```

---

## Response Shape (sesuai skill `api-contract-bugarin`)

### `GET /pt/recommendations`

```typescript
// { data: PtRecommendation[], meta: { total: number } }
type PtRecommendation = {
  id: number;          // pt_profiles.id
  nama: string;
  spesialisasi: "turun_bb" | "naik_bb";
  tempatGym: string;   // selalu non-null di response (PT tanpa tempat_gym difilter)
};
```

### `POST /klien/pairing-requests`

```typescript
// { data: { id: number; status: "pending"; createdAt: string } }
```

### `GET /klien/pairing-requests/current`

```typescript
// { data: CurrentPairingRequest | null }
type CurrentPairingRequest = {
  id: number;
  status: "pending" | "diterima" | "ditolak";
  alasanPenolakan: string | null;  // selalu ada (null jika bukan ditolak) — JANGAN hilangkan key
  createdAt: string;               // ISO 8601
  pt: {
    id: number;
    nama: string;
    spesialisasi: "turun_bb" | "naik_bb";
    tempatGym: string | null;
  };
};
```

### `GET /pt/pairing-requests`

```typescript
// { data: PendingRequestItem[], meta: { total: number } }
type PendingRequestItem = {
  id: number;
  createdAt: string;
  klien: {
    id: number;
    nama: string;
    tujuan: "turun_bb" | "naik_bb" | null;  // dari cycle aktif, null jika belum ada cycle
  };
};
```

### `PUT /pt/pairing-requests/:id` (Terima)

```typescript
// { data: { id: number; status: "diterima" } }
```

### `PUT /pt/pairing-requests/:id` (Tolak)

```typescript
// { data: { id: number; status: "ditolak"; alasanPenolakan: string } }
```

---

## Validasi (Zod)

```
sendPairingRequestSchema:
  ptId: number.int().positive()

rejectPairingRequestSchema:
  alasanPenolakan: string.min(1, "Alasan penolakan wajib diisi").max(500)
```

> **Catatan**: `GET /pt/recommendations` tidak membutuhkan request body — filter `tujuan` diambil dari cycle aktif klien di service layer, bukan dari query param yang dikirim klien.

---

## File yang Akan Dibuat/Diubah

```
src/modules/klien/
  klien.routes.ts         [MODIFY] — tambah 3 route baru
  klien.controller.ts     [NEW]    — handler getPtRecommendations,
                                     sendPairingRequest, getCurrentPairingRequest
  klien.service.ts        [NEW]    — business logic ketiga endpoint klien di atas
  klien.schema.ts         [NEW]    — sendPairingRequestSchema (Zod)

src/modules/pt/
  pt.routes.ts            [MODIFY] — tambah 2 route pairing-requests
  pt.controller.ts        [NEW]    — handler getPairingRequests, respondPairingRequest
  pt.service.ts           [NEW]    — business logic terima/tolak + trigger AI
  pt.schema.ts            [NEW]    — rejectPairingRequestSchema (Zod)
```

> **Catatan Layering**: controller hanya parsing `req`/`res` dan memanggil service. Query Drizzle hanya boleh ada di service. Ikuti pola dari `auth.service.ts` dan `auth.controller.ts` yang sudah ada.

---

## Urutan Implementasi (Saran)

Karena fitur ini punya dua sisi yang saling bergantung untuk bisa ditest, implementasikan dalam urutan ini:

1. `klien.schema.ts` — definisi Zod schema
2. `klien.service.ts` — `getPtRecommendations()`, `sendPairingRequest()`, `getCurrentPairingRequest()`
3. `klien.controller.ts` + `klien.routes.ts` — expose 3 endpoint klien
4. `pt.schema.ts` — definisi Zod schema
5. `pt.service.ts` — `getPairingRequests()`, `respondPairingRequest()` (termasuk transaksi + fire-and-forget AI)
6. `pt.controller.ts` + `pt.routes.ts` — expose 2 endpoint PT
7. Manual test end-to-end via Postman: daftar PT → request → terima → cek `klien_profiles.pt_id` terupdate → tolak → cek `alasan_penolakan` terisi

---

## Dependency ke Fitur Lain

| Dependency | Arah | Keterangan |
|---|---|---|
| `feat/profil-onboarding-klien` | **Bergantung ke sini** | `GET /pt/recommendations` butuh cycle aktif klien; tanpa itu endpoint return 422. Implementasikan fitur ini setelah `profil-onboarding-klien` selesai, atau mock cycle aktif saat testing. |
| `feat/progres-klien` | **Fitur lain bergantung ke sini** | Setelah PT diterima → `klien_profiles.pt_id` terisi → cron job mingguan akan meng-include klien ini saat generate Weekly Plan berikutnya. |
| Modul `ai/weekly-plan.ts` | **Dipakai di sini** | Fire-and-forget saat PT terima request. Modul ini sudah ada — tidak perlu diubah. |
| `feat/pt-profile` (masa depan) | **Keterkaitan** | PT harus punya `tempat_gym` agar muncul di rekomendasi. Sementara testing, pastikan seed/create PT dengan `tempat_gym` terisi. |

---

## Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| Klien belum punya cycle aktif coba lihat rekomendasi | HTTP 422 — jangan tampilkan list kosong |
| Klien sudah punya pending request, coba kirim lagi | HTTP 409 |
| Klien request ke PT yang sudah jadi PT aktifnya | HTTP 409 |
| `ptId` di body tidak ada di database | HTTP 404 |
| PT coba respond request yang bukan miliknya | HTTP 403 |
| PT coba respond request yang sudah direspons | HTTP 409 |
| Tolak tanpa mengisi `alasanPenolakan` | HTTP 400 (Zod validation) |
| `generateWeeklyPlan()` gagal saat terima request | Log error, tetap return HTTP 200 ke PT |

---

## Definition of Done

- [ ] Semua endpoint terimplementasi sesuai layering `express-typescript-patterns` (routes → controller → service)
- [ ] Transaksi di `respondPairingRequest` (terima) diverifikasi atomik — 2 operasi (update request + update klien_profiles) tidak bisa setengah jalan
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` lolos tanpa error
- [ ] Manual test via Postman untuk semua endpoint termasuk **semua edge case** di tabel di atas
- [ ] Fire-and-forget generate Weekly Plan diverifikasi lewat code review — pastikan pemanggilan `generateWeeklyPlan()` **tidak memakai `await`** di jalur utama response, cukup `.catch()` untuk log error
- [ ] Work Result ditulis di PR sesuai format `WORKFLOW.md` bab 5
