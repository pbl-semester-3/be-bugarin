# PRD Fitur: Verifikasi PT

## Metadata

| | |
|---|---|
| **Role** | Personal Trainer (PT) |
| **Branch** | ~~`feat/verifikasi-pt`~~ — **TIDAK DIPAKAI, lihat catatan di bawah** |
| **Status** | **Sudah tercakup di fitur lain — tidak perlu implementasi terpisah** |
| **PRD Rujukan** | `fitur/klien/PRD-pt-ku-klien.md` |

---

## ⚠️ Catatan Penting — Baca Dulu Sebelum Membuat Implementation Plan

Fitur "Verifikasi" di sisi PT (menerima/menolak klien yang memilihnya sebagai PT) **sudah sepenuhnya di-spec dan termasuk dalam scope** `fitur/klien/PRD-pt-ku-klien.md`, dikerjakan di branch `feat/pt-ku-klien`.

**Jangan buat Implementation Plan baru untuk branch `feat/verifikasi-pt`.** Kalau ada task/issue yang mengarah ke fitur ini, redirect ke `feat/pt-ku-klien`.

### Kenapa digabung, bukan dipisah?

Meskipun secara **fungsi/UX** kedua sisi ini berbeda:
- **Sisi Klien** ("PT ku"): memilih PT dari rekomendasi berdasarkan tujuan (turun/naik BB), lalu **menunggu verifikasi** dari PT yang dipilih.
- **Sisi PT** ("Verifikasi"): menerima daftar klien yang memilihnya, lalu **menerima atau menolak** klien tersebut.

...secara **teknis**, keduanya adalah satu alur (`pairing_requests`) yang saling bergantung dan perlu ditest end-to-end sekaligus: klien kirim request → PT terima → verifikasi `klien_profiles.pt_id` ter-update → trigger generate Weekly Plan pertama. Memisah jadi dua branch akan menyulitkan testing alur ini secara utuh, dan berisiko dua dokumen PRD saling tidak sinkron kalau salah satu direvisi.

### Endpoint yang relevan (sudah di-spec lengkap di PRD-pt-ku-klien.md)

| Method & Path | Sisi | Fungsi |
|---|---|---|
| `GET /pt/pairing-requests` | **PT** | List request pending yang masuk ke PT ini — **ini halaman "Verifikasi"** |
| `PUT /pt/pairing-requests/:id` | **PT** | Terima (tanpa body) atau Tolak (body: `alasanPenolakan`) — **aksi utama halaman "Verifikasi"** |
| `GET /pt/recommendations` | Klien | (konteks) List PT yang bisa dipilih klien |
| `POST /klien/pairing-requests` | Klien | (konteks) Klien mengirim request ke PT |
| `GET /klien/pairing-requests/current` | Klien | (konteks) Klien cek status "menunggu verifikasi" |

Untuk detail lengkap: Business Rules #4 dan #5, Response Shape, Validasi Zod, file yang dibuat/diubah (`pt.controller.ts`, `pt.service.ts`, `pt.schema.ts`, `pt.routes.ts`), Edge Cases, dan Definition of Done — semua sudah tersedia di **`fitur/klien/PRD-pt-ku-klien.md`**, bagian "Sisi PT".

### Kalau task Anda menyentuh fitur ini

1. Baca `fitur/klien/PRD-pt-ku-klien.md` secara utuh terlebih dahulu.
2. Cek status branch `feat/pt-ku-klien` — apakah sudah merge ke `dev` atau masih berjalan.
3. Kalau ada perubahan/tambahan kebutuhan spesifik untuk halaman Verifikasi yang **belum tercakup** di PRD tersebut (misalnya: butuh pagination list request, butuh filter/sort tambahan, dsb), **jangan langsung implementasi** — diskusikan dulu apakah ini masuk sebagai revisi ke `PRD-pt-ku-klien.md` (kalau `feat/pt-ku-klien` belum merge) atau sebagai PRD/branch baru terpisah untuk *enhancement* (kalau sudah merge dan perlu iterasi lanjutan).

---

## Dependency

| Dependency | Arah | Keterangan |
|---|---|---|
| `fitur/klien/PRD-pt-ku-klien.md` | **Sumber kebenaran tunggal** | Seluruh spek endpoint, business rules, dan implementasi untuk "Verifikasi PT" ada di sana. File ini murni pointer. |