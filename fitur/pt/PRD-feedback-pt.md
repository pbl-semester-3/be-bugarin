# PRD Fitur: Feedback PT ke Klien

## Metadata

| | |
|---|---|
| **Role** | Personal Trainer (PT) |
| **Branch** | `feat/feedback-pt` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.2 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.2 (Web PT — baris "Feedback": PT tulis masukan, notifikasi ke klien) dan bab 3.4 (Out of Scope: chat berkelanjutan tidak termasuk).
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.2 (kontrak endpoint POST `/pt/klien/:id/feedbacks`).
- `docs/Bugarin_PRD_Frontend.md` bab 4.5 (spesifikasi UI halaman Feedback PT: list ringkas klien → klik → dialog textarea → submit).
- `docs/bugarin_schema_notes.md` bab 8 (Lifecycle *Feedback*, balasan hanya 1x, flag `dibaca` dipakai untuk *badge* notifikasi).
- `docs/bugarin_erd.mermaid` (Tabel `feedbacks`, field `pesan` dan ketiadaan `updated_at`).
- `fitur/klien/PRD-feedback-klien.md` (PENTING: Fitur sisi Penerima/Klien yang sudah *Approved* — penyesuaian wajib selaras dengan kontrak yang ada di sini).
- `fitur/pt/PRD-klien-detail-pt.md` (Pola *ownership check* ganda 404 dan keberadaan endpoint list Klien).

## Ringkasan

Fitur ini merupakan pintu gerbang komunikasi searah-terbatas dari Personal Trainer ke Klien. PT dapat mengirimkan pesan penyemangat, koreksi, atau instruksi spesifik kepada klien tertentu. Balasan dari klien (jika ada) hanya terbatas 1 kali sesuai fungsi aplikasi (bukan aplikasi obrolan *chatting* murni). Fitur ini merupakan pendamping mutlak dari halaman Feedback Klien, memposisikan PT sebagai salah satu aktor pengirim.

---

## Endpoint

*(Catatan: Endpoint POST ini secara desain murni dirancang satu arah ("kirim-dan-lupa") tanpa eksistensi endpoint pendamping GET riwayat, selengkapnya baca Keputusan Desain)*

| Method & Path | Auth | Fungsi |
|---|---|---|
| `POST /pt/klien/:id/feedbacks` | PT | Mengirimkan sebuah masukan/pesan baru dari PT yang ditujukan ke klien dengan `id` tersebut. |

---

## Business Rules

1. **Ownership Check Ketat (Security)**
   - Parameter `:id` mewakili `klien_id`. Backend **WAJIB** menyeleksi silang ke tabel `klien_profiles` untuk memastikan bahwa `klien_profiles.pt_id === req.user.id`.
   - Bila validasi hak milik ini gagal (klien tidak ada, atau klien milik PT lain), sistem mutlak mengembalikan HTTP 404 (`"Data tidak ditemukan"`). Jangan pernah menggunakan HTTP 403 atau pesan spesifik untuk menyembunyikan kebocoran identitas.

2. **Re-use Data List Klien (Tanpa Duplikasi Endpoint)**
   - Menurut PRD Frontend, halaman ini membutuhkan "list nama klien mirip halaman Klien tapi ringkas" untuk PT memilih tujuan *feedback*. 
   - Karena endpoint `GET /pt/klien` di *PRD-klien-detail-pt.md* telah dirancang secara sangat minimalis dan eksklusif (hanya mengembalikan field `id` dan `nama`), maka halaman Feedback PT **wajib melakukan re-use** terhadap endpoint tersebut. Kita tidak akan memproduksi endpoint list klien baru di fitur/modul ini demi menjunjung DRY (*Don't Repeat Yourself*).

3. **Injeksi Data dan Atribut Skema (Sinkronisasi dengan Sisi Klien)**
   - Kolom yang di-*insert* ke tabel `feedbacks` adalah: `klien_id` (dari URL), `pt_id` (dari `req.user.id`), `source` (otomatis di-set `'pt'`), `pesan` (dari *body* request), `dibaca` (otomatis `false`), `balasan_klien` (otomatis `null`).
   - Tidak ada kolom `pesan_feedback` atau `updated_at`. Skema harus patuh 100% pada aturan di `bugarin_erd.mermaid` dan `fitur/klien/PRD-feedback-klien.md`.
   - Operasi penambahan yang sukses harus mengembalikan **HTTP 201 Created**, bukan 200.

4. **Input Manusiawi Tanpa Intervensi AI**
   - Mengingat fitur ini digunakan PT untuk mengirim pesan langsung lewat *textarea*, instruksi bisnis **TIDAK** membutuhkan *trigger* atau validasi LLM (Gemini API). 

5. **Arsitektur Pengiriman Satu Arah ("Kirim dan Lupa")**
   - Sebagai konsekuensi langsung desain antarmuka, modul ini dirancang secara utuh dengan metode pengiriman **"Kirim dan Lupa"**.
   - Kolom-kolom pendukung notifikasi dua-arah di tabel database, yakni nilai `dibaca` dan `balasan_klien` pada record ber-*source* `'pt'`, **TIDAK PERNAH** dibaca kembali, dikalkulasi (*unread badge count*), apalagi diekspos melalui API ke sisi *web* PT di iterasi ini.
   - Biarpun modul *mobile* klien diberi fasilitas mengirim balasan *(merujuk fitur Klien)*, PT tidak akan pernah diberi jalan pintas *backend* untuk melongok teks balasan tersebut di lingkup PRD ini. Pemangkasan relasi ini didokumentasikan di sini sebagai perwujudan batas cakupan yang **DISENGAJA** atas nama spesifikasi produk, bukan celah arsitektur kecacatan rilis (bukan *bug*).

---

## Keputusan Desain (Final)

- **[KEPUTUSAN FINAL] Keberadaan Endpoint Histori Feedback di Sisi PT (Hanya POST)**
  Terkonfirmasi bahwa *wireframe* produk Web PT secara ketat membatasi interaksi hanya sebatas aktivitas *"Memilih klien -> Memberikan feedback"*, tanpa memperlihatkan antarmuka untuk meninjau status *read* maupun melihat daftar *history* riwayat balasan klien.
  - **Keputusan**: Terapkan metode lingkup minimalis (Mutlak hanya 1 Endpoint `POST`). Fitur PT dibatasi HANYA berfokus sebagai corong pengirim masukan. Sistem **tidak akan** pernah menyedikan utilitas *backend* pelengkap semacam `GET /pt/klien/:id/feedbacks` ataupun rekap baca balasan di tahap ini.
  - **Alasan**: Meluruskan dan mematuhi spesifikasi final rupa antarmuka *Frontend* produk. Usaha membidani *endpoint* pemonitor obrolan (untuk memperkaya fungsi notifikasi balasan/badge `dibaca`) dibuang karena dikategorikan sebagai aksi *over-engineering* API tanpa basis pendorong *User Interface*.

---

## Skema Data yang Dipakai

Tidak ada perubahan skema database atau penambahan tabel. 
- Operasi *insert* ke tabel `feedbacks`.

---

## Response Shape

```typescript
// POST /pt/klien/:id/feedbacks
// HTTP 201 Created
type CreateFeedbackResponse = {
  data: {
    id: number;
    klienId: number;
    ptId: number;
    source: "pt";
    pesan: string;
    dibaca: boolean;
    balasanKlien: string | null;
    createdAt: string;
  }
}
```

---

## Validasi (Zod)

**Auth**: `authGuard(["pt"])`

**Zod Request Body (POST `/pt/klien/:id/feedbacks`)**
```typescript
Body: z.object({
  pesan: z.string().trim().min(5, "Pesan feedback tidak boleh terlalu singkat").max(2000, "Pesan terlalu panjang")
})
```

*Path parameter `:id` juga harus divalidasi sebagai bilangan numerik positif (`z.coerce.number().int().positive()`).*

---

## File yang Akan Dibuat/Diubah

```
src/modules/pt/
  pt.routes.ts         [MODIFY] — tambah 1 endpoint POST /klien/:id/feedbacks
  pt.controller.ts     [MODIFY] — tambah 1 handler createFeedback
  pt.service.ts        [MODIFY] — tambah fungsi logika insert dengan ownership check
  pt.schema.ts         [MODIFY] — definisi Zod createFeedbackSchema
```

---

## Urutan Implementasi

1. **Definisi Zod Schema (`pt.schema.ts`)**: Konfigurasikan skema payload spesifik properti `pesan` berjenis string teks.
2. **Implementasi Service (`pt.service.ts`)**:
   - Lakukan pemeriksaan *Ownership Check* pada nilai `id` klien di `klien_profiles`. Jika atribut `pt_id` miliknya tidak cocok dengan identitas penembak API (PT login), atau jika `id` tidak dijumpai, tolak mentah-mentah aliran ini dengan *HTTP 404*.
   - Segera setelah *ownership* dikukuhkan, tembak instruksi `INSERT INTO feedbacks` dengan paramater: `klien_id`, `pt_id` aktif, `source = 'pt'`, `pesan`, dan nilai `dibaca` yang di-set *false* (karena ditujukan agar dilihat sebagai notifikasi bagi klien).
3. **Controller & Router**: Ikat fungsi logis dengan eksekusi penangkap HTTP API di perutean, tangkap status `201 Created`, dan pasang middleware `authGuard`. 

---

## Dependency ke Fitur Lain

| Dependency | Arah | Keterangan |
|---|---|---|
| `feat/klien-detail-pt` | **Penggunaan Ulang (*Reuse*)** | Halaman UI membutuhkan fitur ini untuk memilih klien sasaran. Karena kebutuhannya identik (cukup *id* dan *nama*), sisi Frontend **menggunakan endpoint `GET /pt/klien`** dari fitur/modul tersebut alih-alih membuat jalur list klien duplikat di sini. |
| `feat/feedback-klien` | **Konsistensi Data Penerima** | Merupakan pasangannya di ranah klien. Payload yang dihasilkan endpoint POST ini wajib selaras 100% sehingga Klien yang membaca via sisi *app* tidak mengalami *crash*. |

---

## Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| PT menyisipkan *feedback* untuk klien yang `pt_id`-nya milik PT lain | Menghasilkan HTTP 404 (`"Data tidak ditemukan"`) untuk mengelabui deteksi keberadaan ID oleh PT luar. |
| Pesan kosong atau tidak relevan (< 5 karakter) | Terhalang oleh tameng Zod dan melempar *HTTP 400 Bad Request*. |
| ID klien non-numerik (string) di *URL Params* | Zod *URL param check* melempar HTTP 400. |

---

## Definition of Done

- [ ] Fungsi pengiriman *Feedback* murni (`POST /pt/klien/:id/feedbacks`) sukses terintegrasi di sisi backend PT.
- [ ] Implementasi sukses me-*reuse* parameter endpoint dari Klien Detail PT tanpa menghadirkan salinan endpoint list ekstra.
- [ ] Algoritma validasi ganda kepemilikan klien (*ownership check*) sempurna menghadang dan menjebak kebocoran eksistensi data dengan status tanggapan HTTP 404.
- [ ] Format pelekatan balasan JSON yang terekam dipastikan tidak memuat elemen halusinasi (`pesan_feedback` atau `updated_at`), status *dibaca* selalu ter-reset sebagai notifikasi `false`, dan skema sukses mengantongi status HTTP 201.
- [ ] Ketetapan arsitektur asimetris satu arah ("Kirim-dan-Lupa") dibuktikan secara total pada file *routes* maupun *controller*; ditandai dengan tidak adanya satupun implementasi penciptaan *endpoint GET* pemanggil riwayat balasan (murni mengikuti Keputusan Final).
