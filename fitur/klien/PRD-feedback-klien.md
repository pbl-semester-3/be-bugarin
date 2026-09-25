# PRD Fitur: Feedback Klien

## Metadata

| | |
|---|---|
| **Role** | Klien |
| **Branch** | `feat/feedback-klien` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` bab 4.1 & 6.2 |

## Referensi

- `docs/Bugarin_PRD.md` bab 3.1 (fitur "Feedback" sisi Klien) dan bab 3.4 (Out of Scope — chat berkelanjutan tidak termasuk)
- `docs/Bugarin_PRD_Backend_AI.md` bab 4.1 (kontrak endpoint) dan bab 6.2 (Feedback Mingguan AI)
- `docs/Bugarin_PRD_Mobile.md` bab 3.7 (spesifikasi tampilan layar Feedback)
- `docs/bugarin_schema_notes.md` bab 8 (Feedback — balasan hanya 1x, flag dibaca)
- `docs/bugarin_erd.mermaid` — tabel `feedbacks`
- `fitur/klien/PRD-progres-klien.md` — sumber log mingguan (tanpa memodifikasi)
- `skills/gemini-structured-output` — Pola 2 (responseSchema untuk feedback AI)
- `skills/api-contract-bugarin` — null eksplisit untuk field
- `skills/jwt-auth-security` — ownership check

## Ringkasan

Fitur Feedback Klien menyediakan alur komunikasi satu arah dari AI (Feedback Mingguan / Scheduled) dan dari Personal Trainer (berkala), yang disatukan dalam satu feed (layar Feedback). Klien dapat melihat feedback, membaca (update badge notifikasi), dan memberikan **satu kali balasan** per pesan khusus untuk feedback dari PT (bukan chat berkelanjutan).

Fitur ini juga mencakup implementasi generator feedback AI (Gemini) yang dipanggil secara massal lewat *cron job* mingguan (bukan per-insert log individual) untuk merangkum dan mengomentari performa klien selama 7 hari terakhir.

---

## Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `GET /klien/feedbacks` | Klien | Mengambil daftar semua feedback (dari AI dan PT) untuk klien tersebut, diurutkan dari yang terbaru |
| `POST /klien/feedbacks/:id/reply` | Klien | Membalas sebuah feedback (hanya bisa 1x, khusus source PT) |
| `PUT /klien/feedbacks/:id/read` | Klien | Menandai feedback sebagai sudah dibaca (mengubah `dibaca = true`) |

> **Trigger AI (Bukan Endpoint HTTP)**
> Integrasi pemanggilan Gemini API (generator feedback AI) tidak dibuat sebagai endpoint baru dan **TIDAK** dipicu oleh insert log individual, melainkan dijalankan sebagai **SCHEDULED JOB (cron) mingguan per klien**, mirip pola `generate-weekly-plan` yang sudah ada di modul `jobs/`.

---

## Business Rules

1. **Ownership Check (Wajib)**
   - Saat membalas (`POST .../reply`) atau membaca (`PUT .../read`) feedback, periksa apakah `feedbacks.klien_id` sama dengan `req.user.id`.
   - Jika ID tidak ditemukan, atau ditemukan tetapi milik klien lain → kembalikan response identik: HTTP 404 `"Feedback tidak ditemukan"` (menyembunyikan kepemilikan data klien lain, sesuai standar OWASP seperti pada fitur Riwayat).

2. **Balasan Klien Hanya 1x dan Khusus PT**
   - **Limitasi Source AI**: Klien HANYA boleh membalas feedback yang `source = 'pt'`. Feedback dengan `source = 'ai'` **TIDAK PERNAH** bisa dibalas. Secara desain produk, UI Mobile bahkan tidak akan menampilkan form/opsi balas untuk pesan AI. Jika ada *request* masuk untuk ID feedback ber-*source* AI, tolak dengan HTTP 400 `"Feedback dari AI tidak dapat dibalas"`.
   - **Limitasi Satu Kali**: Klien hanya boleh membalas jika field `balasan_klien` pada record tersebut masih `null`.
   - Jika klien memanggil `POST .../reply` pada feedback (PT) yang sudah memiliki balasan, tolak dengan HTTP 400 `"Feedback sudah dibalas"` (jangan lakukan overwrite).

3. **Sumber Feedback (AI vs PT)**
   - Baris dengan `source = 'ai'` dipastikan memiliki `pt_id = null`.
   - Baris dengan `source = 'pt'` memiliki `pt_id` yang terisi.
   - Response dari `GET /klien/feedbacks` harus membedakan objek `pt` (null jika AI, berisi data PT jika dari PT), konsisten dengan prinsip null eksplisit.

4. **Trigger AI Mingguan (Scheduled Job)**
   - **Sistem Eksekusi**: Dijalankan via *cron job* baru (`generate-weekly-feedback.job.ts`), dijadwalkan secara tegas **setiap Senin pukul 00:00**, bersamaan dengan pengeksekusian *cron* `generate-weekly-plan`. Alasan penyamaan waktu ini adalah agar umpan balik performa klien selama seminggu ke belakang rilis seirama dengan pengumuman jadwal latihan baru minggu depannya.
   - **Pencegahan Duplikasi Eksekusi**: Di dalam *loop* eksekusi, *cron job* WAJIB mengecek `MAX(created_at) FROM feedbacks WHERE source = 'ai' AND klien_id = X`. Jika tanggal rilis terakhir masih di rentang minggu berjalan (< 7 hari), sistem harus men-*skip* klien tersebut. Hal ini membentengi sistem dari bahaya luapan notifikasi jika suatu ketika mesin perulangan (*cron*) me-restart.
   - **Target Data**: Untuk **setiap klien** yang memiliki `progress_cycles` dengan status **aktif**, lakukan agregasi data `activity_logs` dan `meal_logs` selama 7 hari terakhir.
   - **Penanganan Hari Kosong (Parsial)**: Apabila ada hari di mana klien tidak mencatat apa-apa (bolong sebagian), informasi bolong ini **wajib disertakan** dalam konteks *prompt* ke Gemini, sehingga AI bisa menyinggung/memberi semangat terkait kekosongan tersebut. 
   - **Penanganan Vakum Total (0 Log)**: Skenario ekstrem ketika seorang klien sama sekali tidak mengeklik atau menyetor data apa pun selama 7 hari. Meskipun log-nya bersih/tanpa data, *cron job* **TETAP MENGIRIM TEMBAKAN KE API AI**! Konteks ketiadaan total ini dipasok ke instruksi *prompt*, agar keluaran AI memuat dorongan proaktif untuk *"membangkitkan"* keterlibatan ulang (*engagement*) klien yang tengah hilang motivasi.
   - **PENTING (Independensi Streak)**: Kondisi kekosongan log di parameter *cron AI* ini **TIDAK BOLEH** bersinggungan dengan kalkulasi logika *streak* harian. Logika *streak* berjalan di dunia independen (modul Dashboard) dan terisolasi absolut dari manuver generator ini.
   - **Prompting Pola 2**: Gunakan instruksi sistem sesuai *Pola 2* dari skill `gemini-structured-output`:
     - **Role**: "Kamu adalah AI health coach yang suportif dan observatif."
     - **Constraint**: "Maksimal 2 kalimat. Konteksnya adalah rekap performa mingguan, bukan sekadar respons instan. Singgung positif dari catatan log atau berikan dorongan jika ada hari yang bolong. Tidak memberi saran medis spesifik."
     - **Format**: `responseSchema` berupa object dengan properti `pesan` string.
   - **Skema Penyimpanan**: Hasil JSON dimasukkan ke tabel `feedbacks` dengan atribut `source = 'ai'` dan `pt_id = null`.

5. **Tandai Sudah Dibaca**
   - Klien mengubah status `dibaca` menjadi `true` dengan `PUT .../read`.
   - Mengindikasikan klien telah melihat feedback tersebut, berguna untuk memudarkan *badge* notifikasi unread.

## Keputusan Desain (Final / Gaps)

- **[KEPUTUSAN FINAL] Pencegahan Duplikasi Cron Job AI**
  Jika skrip *cron job* mati mendadak, dimatikan lalu direstart manual, atau diulang, bagaimana kita mengetahui klien mana yang sudah di-generate feedback-nya minggu ini, agar tidak ter-generate dua kali?
  - **Keputusan**: Menerapkan strategi **Cek Mandiri lewat Log**. Di dalam *loop cron*, persis sebelum menembakkan *request* ke AI Gemini per klien, lakukan pencarian sederhana: `SELECT MAX(created_at) FROM feedbacks WHERE source = 'ai' AND klien_id = X`. Jika jarak usianya masih kurang dari rentang 7 hari (atau indikasi sudah di-*generate* di minggu ini), maka *skip* (*continue* perulangan) untuk klien bersangkutan.
  - **Alasan**: Memegang teguh kesederhanaan PBL (Opsi ini dipilih sebab tidak menuntut perubahan/migrasi skema DB layaknya menambahkan kolom khusus `last_ai_feedback_at`). *Query* ekstra pada arsitektur monolit ini dipandang stabil dan bebas ancaman performansi serius.
  - **Status**: Resmi berstatus Keputusan Final. Wajib dicantumkan implikasinya pada algoritma kerja perulangan *cron job*.

- **[KEPUTUSAN FINAL] Badge Unread — Embed di Dashboard Summary**
  Mobile butuh angka *unread count* untuk *badge* di icon Bottom Nav (sebelum user membuka tab Feedback).
  - **Keputusan**: Tambahkan field `unreadFeedbackCount` pada response `GET /klien/dashboard-summary` yang mana selalu di-fetch tiap memuat *Home/Dashboard*.
  - **Alasan UX**: Badge di Bottom Nav harus sudah muncul sejak dashboard/beranda dibuka, sebelum klien membuka tab Feedback sama sekali. Endpoint `dashboard-summary` adalah endpoint agregat yang pasti selalu di-fetch pertama kali oleh klien, sehingga ini tempat paling tepat secara UX. Jangan duplikasi field ini di respons endpoint `/feedbacks`.
  - **Status**: Keputusan final. Task tambahan perlu ditambahkan di modul `dashboard-summary`.

- **[KEPUTUSAN FINAL] Pemisahan Branch PT vs Klien**
  Sisi klien (`feat/feedback-klien`) dipisah dari sisi PT mengirim feedback (`feat/feedback-pt`).
  - **Alasan**: UI dan alur bisnisnya sama sekali berbeda. Klien hanya membaca dan membalas 1x. PT yang aktif menginisiasi feedback. Pengujian E2E sisi klien tetap bisa dilakukan dengan melakukan data seeding *dummy* di tabel `feedbacks`. Sama seperti filosofi pembagian branch `pt-ku-klien` dan PT-side matching.

---

## Skema Data yang Dipakai (Tidak Ada Perubahan Schema)

Tabel `feedbacks` sudah ada.

```
feedbacks
  id                INT PK
  klien_id          FK → klien_profiles.id
  pt_id             FK → pt_profiles.id (NULLABLE — null jika dari AI)
  source            ENUM('ai', 'pt')
  pesan             TEXT
  balasan_klien     TEXT (NULLABLE — null jika belum dibalas)
  dibaca            BOOLEAN DEFAULT false
  created_at        TIMESTAMP
```

---

## Response Shape

```typescript
// GET /klien/feedbacks
// HTTP 200
// { data: FeedbackItem[], meta: { total: number } }

type FeedbackItem = {
  id: number;
  source: "ai" | "pt";
  pesan: string;
  balasanKlien: string | null;
  dibaca: boolean;
  createdAt: string; // ISO 8601
  pt: {
    id: number;
    nama: string;
    // foto profil jika ada
  } | null; // null jika source === 'ai'
};

// POST /klien/feedbacks/:id/reply
// HTTP 200
// Body request: { balasan: string }
// { data: FeedbackItem }  // Mengembalikan row feedback yang baru saja di-update

// PUT /klien/feedbacks/:id/read
// HTTP 200
// Body request kosong
// { data: FeedbackItem }  // Mengembalikan row feedback yang baru saja di-update (dibaca = true)
```

---

## Validasi (Zod)

**GET `/klien/feedbacks`**
```
Auth:
  authGuard(["klien"])
```

**POST `/klien/feedbacks/:id/reply`**
```
Path param:
  id → z.coerce.number().int().positive()

Body:
  balasan → z.string().min(1, "Balasan tidak boleh kosong").max(1000)

Auth:
  authGuard(["klien"])
```

**PUT `/klien/feedbacks/:id/read`**
```
Path param:
  id → z.coerce.number().int().positive()

Auth:
  authGuard(["klien"])
```

---

## File yang Akan Dibuat/Diubah

```
src/modules/klien/
  klien.routes.ts         [MODIFY] — tambah 3 route (GET, POST reply, PUT read)
  klien.controller.ts     [MODIFY] — tambah 3 handler
  klien.service.ts        [MODIFY] — tambah logika baca/balas/baca feedback
  klien.schema.ts         [MODIFY] — tambah schema request body reply

src/jobs/
  generate-weekly-feedback.job.ts [NEW] — File job cron untuk looping klien, agregasi data mingguan, pemanggilan Gemini API Pola 2, dan insert ke tabel feedbacks.
```

---

## Urutan Implementasi

1. `klien.schema.ts` — Buat `replyFeedbackSchema` dengan properti `balasan` (string, wajib).
2. `klien.service.ts` (CRUD Feedback) — Implementasikan:
   - `getFeedbacks(klienId)`: SELECT dengan `LEFT JOIN` ke `pt_profiles` (untuk melengkapi properti `pt`).
   - `replyFeedback(klienId, feedbackId, balasan)`: Ownership check (ID salah atau milik orang lain = `AppError(404)`). Cek *source* (jika `'ai'` lemparkan `AppError(400)`). Cek apakah `balasan_klien` null. Update dan return data utuh.
   - `readFeedback(klienId, feedbackId)`: Ownership check. Update `dibaca = true`.
3. `klien.controller.ts` & `klien.routes.ts` — Sambungkan validasi (Zod coerce `id` + parsing body), panggil service, gunakan format envelope.
4. `jobs/generate-weekly-feedback.job.ts` — Buat skrip *cron job*:
   - Melakukan loop pada semua klien berstatus *cycle active*.
   - Melakukan penampisan duplikasi mingguan dengan memeriksa `MAX(created_at)` milik baris feedback `source = 'ai'` klien bersangkutan. Lompati (`continue`) apabila sudah ditarik di periode waktu minggu ini.
   - Mengeksekusi penarikan agregat data log makanan dan aktivitas 7 hari terakhir (masukkan realita bolong—termasuk ketiadaan riwayat hingga 0 log total—ke dalam racikan parameter instruksi ke *prompt*).
   - Memanggil `Gemini API` via metode terstruktur Pola 2.
   - Mengeksekusi `INSERT` ke tabel `feedbacks` (dengan status `source = 'ai'`).

---

## Dependency ke Fitur Lain

| Dependency | Arah | Keterangan |
|---|---|---|
| `Pola Cron Job Mingguan` | **Arsitektur Eksekusi** | Sistem modul `generate-weekly-feedback.job.ts` ini bergantung dan menyontek kerangka eksekusi/pola perulangan yang sudah divalidasi dan mapan pada fitur jadwal mingguan AI (`generate-weekly-plan.job.ts`). |
| `feat/feedback-pt` | **Fitur lain terpisah** | Endpoint `POST /pt/klien/:id/feedbacks` untuk PT memberikan feedback tidak dimasukkan dalam cakupan fitur ini, melainkan di branch independen. Data untuk pengujian klien bisa melalui insert/seed DB secara manual. |
| `feat/dashboard-klien` | **Bergantung ke ini** | Penambahan field `unreadFeedbackCount` di respons `GET /klien/dashboard-summary`. Membutuhkan eksekusi query `SELECT COUNT(*) FROM feedbacks WHERE klien_id = X AND dibaca = false`. Task ini harus dikoordinasikan/dikerjakan di service `dashboard-summary`. |

---

## Edge Cases yang Wajib Dihandle

| Skenario | Respons yang Benar |
|---|---|
| Klien mencoba membalas feedback ber-*source* `'ai'` | HTTP 400 `"Feedback dari AI tidak dapat dibalas"` (terblokir murni di validasi backend, disamping penyembunyian UI Frontend) |
| Membalas feedback yang `balasan_klien`-nya sudah terisi string | HTTP 400 `"Feedback sudah dibalas"` (jangan timpa data) |
| `:id` di URL bukan angka valid (NaN) saat balas/read | HTTP 400 (Zod Error Validation) |
| Feedback dengan `:id` tidak ditemukan | HTTP 404 `"Feedback tidak ditemukan"` |
| Feedback ditemukan, tetapi `klien_id` != klien login | HTTP 404 `"Feedback tidak ditemukan"` (menyembunyikan kepemilikan data) |
| Klien vakum total (0 catatan log makanan/olahraga dalam 7 hari) | Cron job **TETAP menyala menembak API AI** dengan mendeskripsikan kekosongan 7 hari tersebut dalam parameter *prompt*. Langkah taktis agar AI proaktif menelurkan umpan balik yang memotivasi pengembalian *engagement* dari klien tak aktif itu. |
| Cron job AI feedback gagal untuk satu klien (API error/timeout) | Sistem wajib me-*log* error tersebut dan **terus melanjutkan iterasi/perulangan** ke klien berikutnya, **JANGAN** sampai membuat aplikasi *crash* atau memberhentikan *batch* untuk klien lainnya. |
| Database gagal saat insert balasan feedback | HTTP 500 (di-handle oleh global error handler) |

---

## Definition of Done

- [ ] Schema request untuk reply `replyFeedbackSchema` tervalidasi via Zod.
- [ ] Validasi path parameter `id` menggunakan Zod coerce.
- [ ] Ownership check mencegah akses lintas pengguna dan mengembalikan `404` identik untuk ID salah dan ID milik pengguna lain.
- [ ] Validasi penolakan membalas feedback AI (*source='ai'*) tegak berdiri memuntahkan HTTP 400.
- [ ] Hanya mengizinkan balasan jika kolom `balasan_klien` masih kosong.
- [ ] Endpoint GET mengembalikan gabungan feed AI dan PT dengan pembedaan field `pt` (berisi data untuk PT, `null` untuk AI).
- [ ] Penjadwalan Feedback AI Mingguan terwujud dalam sebuah file utilitas *cron* baru (`jobs/generate-weekly-feedback.job.ts`) yang berjalan sempurna secara *batching*.
- [ ] Gemini API dipanggil sesuai Pola 2 (menggunakan `systemInstruction` yang baru dengan *responseSchema* properti tunggal `pesan`, dengan perumusan prompt yang menyertakan informasi kekosongan hari jika relevan tanpa mengusik hitungan *streak*).
- [ ] Field `unreadFeedbackCount` berhasil ditambahkan ke response `GET /klien/dashboard-summary` dan terverifikasi query COUNT benar.
- [ ] Mekanisme cek `MAX(created_at)` untuk menghempas potensi duplikasi tembakan *generate* mingguan per klien terverifikasi bekerja anti-bocor di kerangka rutinitas file *cron job*.
- [ ] Manual testing (Postman) lulus untuk membalas, membaca.
- [ ] Work Result terisi sesuai bab 5 `WORKFLOW.md`.
