# PRD Fitur: OAuth Google (Klien)

## Metadata

| | |
|---|---|
| **Role** | Klien (Mobile) |
| **Branch** | `feat/oauth-google-klien` |
| **Status** | Approved — siap implementasi |
| **PRD Induk** | `Bugarin_PRD_Backend_AI.md` (Auth) |

## Referensi

- `bugarin-mobile/docs/CATATAN.md` §3 (OAuth Google/Apple — Apple **tidak dipakai**).
- `src/modules/auth/*` (pola register/login, `issueToken`, cookie web vs token mobile).
- `src/db/schema/users.ts`, `klien-profiles.ts`.
- Skill `jwt-auth-security`, `api-contract-bugarin`.

## Ringkasan

Klien dapat login/daftar memakai akun Google (mobile-native Google Sign-In → kirim ID token ke
backend). Backend memverifikasi ID token, lalu menerbitkan JWT app. **Hanya untuk role klien**;
akun PT/Admin tetap dibuat Admin dan login via password. Apple Sign-In **tidak dipakai**.

## Endpoint

| Method & Path | Auth | Fungsi |
|---|---|---|
| `POST /auth/oauth/google` | Publik | Body `{ idToken }` → verifikasi Google → `{ data: { token, role } }` |

## Business Rules

1. **Konfigurasi**: bila `GOOGLE_CLIENT_ID` kosong → `503 "Login Google belum dikonfigurasi"`.
2. **Verifikasi**: ID token diverifikasi ke Google (audience = `GOOGLE_CLIENT_ID`). Invalid/expired → `401`.
3. **Wajib terverifikasi**: `email` harus ada dan `email_verified === true`; `sub` = Google ID. Gagal → `401`.
4. **Pencocokan akun**:
   - Cari `users.google_id = sub`. Ketemu → pastikan `role = klien` (bukan → `403`), terbitkan token.
   - Jika belum: cari `users.email = email`.
     - `role ≠ klien` → `403` (PT/Admin tetap via password).
     - `google_id` null → link `google_id = sub`.
     - `google_id` berbeda → `409`.
   - Jika email belum ada → **buat klien baru** (transaksi): `users` (email, username auto-unik,
     `password_hash` = hash password acak, `role = klien`, `google_id = sub`) + `klien_profiles`
     (nama dari `payload.name`, fallback bagian lokal email).
5. **Akun Google-only**: password acak tidak diketahui siapa pun → praktis hanya bisa login via Google.
   Bila klien kehilangan akses Google, Admin dapat menimpa password baru (`PUT /admin/users/:id`,
   fitur Admin) agar bisa login via email+password. Akun Google asli tidak tersentuh.
6. **Username** di-generate otomatis (bagian lokal email + suffix angka bila bentrok) dan bersifat
   **final** — hanya Admin yang boleh mengubah (keputusan produk; tidak ada self-service).
7. **Response** mengikuti pola login: mobile `{ data: { token, role } }`; web (bila ada)
   set cookie httpOnly.

## Skema Data

Ada 1 perubahan: kolom `users.google_id` (`varchar(255)`, UNIQUE, nullable). `password_hash`
tetap NOT NULL. Migration via `npm run db:generate`.

## Validasi (Zod)

```ts
oauthGoogleSchema = z.object({ idToken: z.string().min(1, "idToken wajib diisi") });
```

## File yang Dibuat/Diubah

```
src/
  db/schema/users.ts            [MODIFY] — googleId
  db/migrations/000X_*.sql      [NEW]
  config/env.ts                 [MODIFY] — GOOGLE_CLIENT_ID (opsional)
  modules/auth/google.ts        [NEW]    — googleAuth.verifyIdToken (patchable untuk test)
  modules/auth/auth.schema.ts   [MODIFY] — oauthGoogleSchema
  modules/auth/auth.service.ts  [MODIFY] — loginWithGoogle + generateUniqueUsername
  modules/auth/auth.controller.ts [MODIFY] — handler oauthGoogle
  modules/auth/auth.routes.ts   [MODIFY] — POST /oauth/google
```

## Edge Cases

| Skenario | Respons |
|---|---|
| `GOOGLE_CLIENT_ID` kosong | 503 |
| ID token invalid/expired | 401 |
| `email_verified = false` / email kosong | 401 |
| Email milik PT/Admin | 403 |
| Email sudah terhubung `google_id` lain | 409 |
| Login ulang Google (sub sama) | sukses, tanpa duplikat |
| Body tanpa `idToken` | 400 (Zod) |

## Definition of Done

- [ ] `POST /auth/oauth/google` terimplementasi, envelope `{ data }`.
- [ ] Klien baru dibuat (users + klien_profiles) tanpa duplikat; login ulang idempotent.
- [ ] Hanya role klien yang dilayani; PT/Admin ditolak.
- [ ] Lint/typecheck/build lolos + manual test terdokumentasi.
