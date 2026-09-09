---
name: express-typescript-patterns
description: Struktur project, layering, error handling, dan konvensi TypeScript untuk backend Express.js Bugarin. Gunakan saat menulis route, controller, service, atau middleware baru di backend.
metadata:
  origin: bugarin-project
  adapted_from: ECC backend-patterns, error-handling (MIT license, https://github.com/affaan-m/ECC)
---

# Express.js + TypeScript Patterns (Bugarin)

Konvensi wajib untuk backend Bugarin (Express.js + TypeScript + Drizzle + MySQL). Tujuannya: kode konsisten antar modul (klien, pt, admin, ai) walau dikerjakan beberapa orang.

## Activation

- Menulis route/endpoint baru di modul `klien`, `pt`, `admin`, `master-data`, atau `ai`.
- Menulis middleware baru (auth guard, error handler, rate limit).
- Review PR backend — cek kepatuhan terhadap layering di bawah.

## Struktur Folder (wajib diikuti)

```
src/
 ├─ config/          # env loader, db connection, gemini client singleton
 ├─ db/
 │   ├─ schema/       # 1 file per tabel Drizzle (users.ts, klien-profiles.ts, dst)
 │   └─ migrations/   # hasil drizzle-kit generate, jangan diedit manual
 ├─ modules/
 │   ├─ auth/
 │   │   ├─ auth.routes.ts
 │   │   ├─ auth.controller.ts
 │   │   ├─ auth.service.ts
 │   │   └─ auth.schema.ts      # Zod schema request body
 │   ├─ klien/ (pola sama)
 │   ├─ pt/
 │   ├─ admin/
 │   ├─ master-data/
 │   └─ ai/
 ├─ middlewares/
 │   ├─ auth-guard.ts
 │   ├─ error-handler.ts
 │   └─ rate-limit.ts
 ├─ jobs/
 │   └─ generate-weekly-plan.job.ts
 └─ app.ts
```

**Aturan layering** (satu arah, tidak boleh dibalik):

`routes` → `controller` (parsing req/res saja) → `service` (business logic) → `db/schema` (Drizzle query)

Controller **tidak boleh** memanggil Drizzle langsung. Service **tidak boleh** menyentuh `req`/`res`. Ini membuat service gampang di-reuse (mis. dipanggil dari cron job `generate-weekly-plan.job.ts`, bukan cuma dari HTTP request).

## Route & Controller

```typescript
// modules/klien/klien.routes.ts
import { Router } from "express";
import { authGuard } from "../../middlewares/auth-guard";
import { getProfile, updateProfile } from "./klien.controller";

const router = Router();
router.get("/profile", authGuard(["klien"]), getProfile);
router.put("/profile", authGuard(["klien"]), updateProfile);
export default router;
```

```typescript
// modules/klien/klien.controller.ts
import type { Request, Response, NextFunction } from "express";
import { updateProfileSchema } from "./klien.schema";
import * as klienService from "./klien.service";

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateProfileSchema.parse(req.body); // lempar ZodError jika invalid
    const result = await klienService.updateProfile(req.user!.id, parsed);
    res.json({ data: result });
  } catch (err) {
    next(err); // selalu delegasikan ke error-handler, jangan res.status(500) manual di sini
  }
}
```

Setiap async controller **wajib** dibungkus try/catch + `next(err)`, atau pakai wrapper `asyncHandler` supaya error async tidak lolos jadi unhandled rejection:

```typescript
// middlewares/async-handler.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";

export function asyncHandler(fn: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}
```

## Error Handling (satu format untuk semua error)

```typescript
// middlewares/error-handler.ts
import { ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { fields: err.flatten().fieldErrors } });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err); // ganti dengan logger terstruktur (pino/winston) saat production
  return res.status(500).json({ error: "Internal server error" });
}
```

Pakai `throw new AppError(404, "PT tidak ditemukan")` di service, jangan `res.status()` di dalam service — service tidak punya akses ke `res`.

## Tipe `req.user` (dari JWT)

Deklarasikan augmentasi tipe sekali di `types/express.d.ts`, supaya `req.user` ter-type di semua controller:

```typescript
// types/express.d.ts
import "express";

declare module "express" {
  interface Request {
    user?: { id: number; role: "klien" | "pt" | "admin" };
  }
}
```

## Environment Variables

Validasi `.env` sekali saat startup pakai Zod (jangan biarkan `process.env.X` bisa `undefined` menyebar ke seluruh kode):

```typescript
// config/env.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string(),
  WEB_ORIGIN: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

## Anti-Patterns

| Anti-Pattern | Risiko | Perbaikan |
|---|---|---|
| Query Drizzle langsung di controller | Logic tersebar, susah di-test/reuse | Pindah ke `*.service.ts` |
| `res.status(500).json(...)` manual di tiap controller | Format error tidak konsisten | Selalu `next(err)`, format di `error-handler.ts` |
| `process.env.X!` tanpa validasi | Crash runtime samar kalau env hilang | Validasi Zod di `config/env.ts` saat startup |
| Async controller tanpa try/catch | Unhandled rejection, server bisa hang | `asyncHandler` wrapper atau try/catch eksplisit |
| Business logic di dalam cron job langsung | Tidak reusable, tidak testable | Cron job cukup panggil `service` yang sama dengan endpoint |

## Related

- Skill: `drizzle-mysql-patterns` — pola schema & query database
- Skill: `jwt-auth-security` — implementasi auth guard di atas
- Skill: `api-contract-bugarin` — konvensi response/error shape
