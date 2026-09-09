---
name: jwt-auth-security
description: Implementasi JWT auth dengan strategi berbeda untuk Web (httpOnly cookie) dan Mobile (bearer token), plus hardening CORS/helmet/rate-limit sesuai keputusan tech stack Bugarin. Gunakan saat mengerjakan modul auth atau saat review keamanan endpoint.
metadata:
  origin: bugarin-project
  adapted_from: ECC security-review (MIT license, https://github.com/affaan-m/ECC)
---

# JWT Auth & Security Hardening (Bugarin)

Rujuk `bugarin_tech_stack.md` bab Keamanan untuk keputusan yang mendasari skill ini. Inti: strategi penyimpanan token **beda** antara Web (PT/Admin) dan Mobile (Klien), karena beda profil risiko CSRF/XSS.

## Activation

- Menulis/mengubah endpoint `/auth/*`.
- Menambah endpoint baru yang butuh proteksi role tertentu.
- Review keamanan sebelum deploy (checklist di bagian akhir).

## Penerbitan Token

```typescript
// modules/auth/auth.service.ts
import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export function issueToken(user: { id: number; role: "klien" | "pt" | "admin" }) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: "7d", // sesuaikan; refresh token di luar scope MVP PBL
  });
}
```

## Strategi Penyimpanan — Berbeda per Platform

### Web (PT & Admin, via Next.js)

Set token sebagai cookie **httpOnly**, bukan dikembalikan di response body:

```typescript
// modules/auth/auth.controller.ts
res.cookie("token", token, {
  httpOnly: true,
  secure: true,          // wajib true di production (HTTPS)
  sameSite: "strict",    // mitigasi CSRF utama — browser tidak kirim cookie lintas situs
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
res.json({ data: { role: user.role } }); // jangan sertakan token di body untuk web
```

Kenapa `httpOnly` + `SameSite=Strict`: JS di browser tidak bisa baca cookie ini (imun pencurian token via XSS), dan browser tidak akan mengirim cookie ini pada request yang berasal dari situs lain (mitigasi CSRF tanpa perlu CSRF token terpisah).

### Mobile (Klien, via Flutter)

Token dikembalikan di response body, **bukan** cookie:

```typescript
res.json({ data: { token, role: user.role } }); // mobile only
```

Flutter menyimpan token via `flutter_secure_storage` (Keychain/Keystore), mengirim manual lewat header:

```dart
dio.options.headers['Authorization'] = 'Bearer $token';
```

CSRF tidak relevan di sini karena bukan konteks browser — jangan terapkan pola cookie untuk mobile.

### Cara Backend Membedakan Web vs Mobile

Bedakan lewat header custom sederhana (mis. `X-Client-Type: web|mobile`) yang dikirim tiap request dari masing-masing app, atau via route terpisah (`/auth/login/web` dan `/auth/login/mobile`) kalau ingin lebih eksplisit. Pilih salah satu dan konsisten di seluruh tim.

## Middleware Auth Guard

```typescript
// middlewares/auth-guard.ts
import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "./error-handler";

export function authGuard(allowedRoles: Array<"klien" | "pt" | "admin">): RequestHandler {
  return (req, res, next) => {
    const bearer = req.headers.authorization?.replace("Bearer ", "");
    const token = bearer ?? req.cookies?.token; // dukung dua sumber sekaligus
    if (!token) return next(new AppError(401, "Unauthorized"));

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: number; role: string };
      if (!allowedRoles.includes(payload.role as any)) {
        return next(new AppError(403, "Forbidden"));
      }
      req.user = { id: payload.sub, role: payload.role as any };
      next();
    } catch {
      next(new AppError(401, "Token tidak valid atau kedaluwarsa"));
    }
  };
}
```

Butuh `cookie-parser` middleware terpasang di `app.ts` agar `req.cookies` terisi.

## Hardening Wajib (app.ts)

```typescript
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

app.use(helmet());
app.use(cookieParser());
app.use(cors({
  origin: [env.WEB_ORIGIN],   // whitelist eksplisit, JANGAN "*"
  credentials: true,          // wajib true supaya cookie httpOnly ikut terkirim
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use("/auth", authLimiter); // cegah brute-force login/register
```

## Password Hashing

```typescript
import argon2 from "argon2"; // atau bcrypt

export const hashPassword = (plain: string) => argon2.hash(plain);
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain);
```

Jangan simpan atau log password plaintext di titik mana pun (termasuk saat Admin membuat akun PT baru — password sementara di-generate random, di-hash sebelum insert, dan hanya dikirim sekali ke PT lewat jalur di luar aplikasi, mis. ditampilkan sekali di UI Admin untuk disalin manual).

## XSS Defense (sisi Frontend, dicatat di sini untuk kelengkapan)

- React/Next.js meng-escape output JSX secara default — tetap **jangan pernah** pakai `dangerouslySetInnerHTML` untuk render feedback/nama makanan custom dari user atau AI.
- Tambahkan Content-Security-Policy header di Next.js sebagai lapisan tambahan.

## Security Review Checklist

- [ ] Endpoint baru dibungkus `authGuard([...])` dengan role yang benar (bukan asal `["klien","pt","admin"]` untuk semua).
- [ ] Endpoint yang menerima `klien_id`/`pt_id` dari parameter selalu divalidasi kepemilikan (klien A tidak bisa akses data klien B lewat ubah ID di URL).
- [ ] Tidak ada `origin: "*"` di konfigurasi CORS.
- [ ] Cookie token selalu `httpOnly` + `Secure` (Secure boleh `false` hanya saat development lokal non-HTTPS).
- [ ] Response body web tidak pernah menyertakan token JWT.
- [ ] Rate limit aktif di `/auth/*`.
- [ ] Password di-hash sebelum insert, tidak pernah muncul di log server.

## Related

- Skill: `express-typescript-patterns` — layering middleware ini di project
- Skill: `api-contract-bugarin` — format response error 401/403
