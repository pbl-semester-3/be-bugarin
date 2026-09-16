# Bugarin Backend — Workflow & Coding Rules

Dokumen ini mengatur cara kerja tim di repo `be-bugarin`: dari mulai kerjain task sampai push. Wajib diikuti semua kontributor (termasuk kalau kerja bareng AI agent/Claude Code).

---

## 1. Implementation Plan (Sebelum Coding)

**Jangan langsung nulis kode begitu dapat task.** Setiap task (endpoint baru, fitur baru, perubahan schema) wajib mulai dari rencana tertulis singkat dulu, direview, baru dieksekusi.

### Format Implementation Plan

```markdown
## Task: <nama task, mis. "Implementasi endpoint Progres — activity-logs & meal-logs">

**Referensi**: Bugarin_PRD_Backend_AI.md bab 4.1, bugarin_erd.mermaid (activity_logs, meal_logs)

**Yang akan dibuat/diubah**:
- `src/modules/klien/klien.schema.ts` — tambah activityLogSchema, mealLogSchema
- `src/modules/klien/klien.service.ts` — tambah createActivityLog(), createMealLog()
- `src/modules/klien/klien.controller.ts` — tambah handler
- `src/modules/klien/klien.routes.ts` — tambah POST /klien/activity-logs, POST /klien/meal-logs

**Endpoint yang terpengaruh**: POST /klien/activity-logs, POST /klien/meal-logs

**Perubahan schema DB?**: Tidak (tabel sudah ada di scaffold)

**Business logic penting**: kalkulasi kalori pakai rumus MET (activity) / kalori_per_100g (meal) —
lihat skill drizzle-mysql-patterns bab "Query Patterns Spesifik Bugarin"

**Risiko/hal yang perlu diperhatikan**: makanan custom yang belum ada di master_makanan
harus trigger estimateFoodCalories() dari modul ai/
```

### Alur Approval

1. Kontributor (atau AI agent) susun Implementation Plan di atas.
2. **Post di PR draft / komentar issue** sebelum mulai nulis kode — bukan sesudah.
3. Reviewer (PM/lead) approve atau kasih catatan revisi rencana.
4. Baru eksekusi coding setelah plan di-approve.
5. Kalau di tengah jalan ternyata rencana perlu berubah signifikan (mis. ketemu keterbatasan teknis), **update plan-nya dulu** dan minta approval ulang sebelum lanjut — jangan diam-diam menyimpang dari rencana awal.

> Kenapa ini penting: mencegah kerja ulang besar-besaran karena kesalahpahaman scope, dan memberi kesempatan reviewer menangkap masalah desain sebelum ada kode yang harus dibongkar.

---

## 2. Branching Strategy

```
main                  ← selalu deployable, cuma nerima merge dari dev via PR
 └─ dev                ← branch kerja utama, integrasi semua fitur
     ├─ feat/klien-progres-endpoints
     ├─ feat/pt-verifikasi
     ├─ fix/auth-guard-cookie-mobile
     └─ chore/update-eslint-config
```

### Aturan Penamaan Branch

| Prefix | Untuk |
|---|---|
| `feat/` | Fitur/endpoint baru |
| `fix/` | Perbaikan bug |
| `chore/` | Setup, config, dependency, tooling |
| `docs/` | Perubahan dokumentasi saja |
| `refactor/` | Restrukturisasi kode tanpa ubah behavior |

Nama branch pakai kebab-case, deskriptif: `feat/klien-progres-endpoints` bukan `feat/update` atau `feat/klien2`.

### Aturan Merge

- **Tidak ada commit langsung ke `main`** — semua lewat PR dari `dev`.
- **Tidak ada commit langsung ke `dev`** untuk perubahan lebih dari 1 file kecil — pakai branch fitur + PR, biar ada review point.
- PR ke `dev` minimal 1 approval sebelum merge (kalau tim cuma 2-3 orang, saling review boleh gantian).
- `dev` → `main` dilakukan di titik milestone (mis. sebelum demo/submit), bukan tiap hari.

---

## 3. Testing Lokal Wajib Sebelum Push

**Tidak boleh push kalau salah satu dari ini gagal:**

```bash
npm run lint         # harus 0 error (warning boleh, tapi usahakan beresin juga)
npm run typecheck    # harus 0 error
npm run build        # harus sukses tanpa error
```

Jalankan urut seperti di atas — `lint` dan `typecheck` lebih cepat, ketauan salah duluan sebelum nunggu `build` selesai.

Kalau nambah/ubah schema Drizzle, tambahan wajib:
```bash
npm run db:generate   # pastikan migration ke-generate tanpa error
```
Review file migration hasil generate-nya sebelum commit — pastikan sesuai maksud (index, FK, nullable, dst benar).

**Tidak ada pengecualian "nanti aja dibenerin setelah push"** — kalau salah satu command di atas gagal, task belum selesai, jangan push dulu.

---

## 4. Commit Rules

Format: **Conventional Commits, pesan dalam Bahasa Indonesia**.

```
<tipe>: <deskripsi singkat pakai kata kerja awal>

[body opsional, jelasin "kenapa" kalau perubahan tidak trivial]
```

### Tipe yang Dipakai
`feat`, `fix`, `chore`, `docs`, `refactor`, `test`

### Contoh
```
feat: tambah endpoint activity-logs dan meal-logs untuk klien
fix: perbaiki auth guard yang tidak baca cookie di request OPTIONS
chore: upgrade drizzle-orm ke 0.45.2 untuk perbaikan SQL injection
docs: update SETUP.md bagian deployment Render
refactor: pindahkan validasi Zod dari controller ke schema terpisah
```

### Aturan Tambahan
- 1 commit = 1 perubahan logis. Jangan gabung "tambah endpoint X" dengan "perbaiki typo di file lain yang tidak berhubungan" dalam 1 commit.
- Commit message **bukan** narasi proses ("coba-coba fix", "update lagi", "fix fix fix") — tulis hasil akhirnya apa.
- Kalau commit menutup/terkait issue tertentu, referensikan di body: `Terkait #12`.

---

## 5. Work Result (Setelah Task Selesai)

Setiap task yang sudah di-push wajib dilaporkan balik dengan format ini (di PR description atau komentar issue) — ini yang direview/di-audit sebelum di-merge:

```markdown
## Work Result: <nama task>

**Branch**: feat/klien-progres-endpoints
**Implementation Plan**: [link ke plan di atas / komentar sebelumnya]

**Yang selesai dikerjakan**:
- [x] POST /klien/activity-logs — insert + kalkulasi kalori via rumus MET
- [x] POST /klien/meal-logs — insert + kalkulasi kalori, get-or-create master_makanan
- [x] Validasi Zod untuk kedua endpoint

**Yang BELUM selesai / di luar scope task ini** (kalau ada):
- Streak recalculation belum di-trigger otomatis setelah insert (task terpisah)

**Hasil testing lokal**:
- `npm run lint` → 0 error
- `npm run typecheck` → 0 error
- `npm run build` → sukses
- Manual test via Postman: [screenshot/hasil singkat]

**Perubahan schema/migration?**: Tidak / Ya — [nama file migration]

**Hal yang perlu diperhatikan reviewer**:
- Endpoint meal-logs bisa lambat kalau makanan custom trigger Gemini API call — worth
  dites dengan network lambat juga.
```

> Kenapa ini penting: reviewer (atau kamu sendiri sebagai PM) bisa audit hasil kerja tanpa harus baca ulang seluruh diff dari nol, dan ada jejak tertulis kalau ada bug muncul belakangan — gampang lacak balik ke task/plan mana asalnya.

---

## Ringkasan Alur Satu Task

```
1. Terima/ambil task
2. Tulis Implementation Plan → post untuk direview
3. Approved → checkout branch baru dari dev (feat/xxx)
4. Coding
5. npm run lint && npm run typecheck && npm run build  → semua harus lolos
6. Commit (Conventional Commits, Bahasa Indonesia)
7. Push branch → buka PR ke dev
8. Tulis Work Result di PR
9. Review → approve → merge ke dev
```
