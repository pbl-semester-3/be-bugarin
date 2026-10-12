import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET minimal 32 karakter — generate: openssl rand -base64 32"),
  GEMINI_API_KEY: z.string().min(1),
  // Satu atau beberapa origin FE, dipisah koma (mis. "http://localhost:3000,https://bugarin.my.id").
  WEB_ORIGIN: z
    .string()
    .min(1)
    .refine(
      (value) => value.split(",").every((part) => {
        try {
          new URL(part.trim());
          return true;
        } catch {
          return false;
        }
      }),
      "WEB_ORIGIN harus URL valid (boleh beberapa, dipisah koma)",
    ),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CRON_SECRET: z.string().min(1),
  // Atribut SameSite cookie auth web. "lax" default (aman untuk same-site/lokal).
  // Pakai "none" (butuh HTTPS/secure) hanya bila FE & BE beda site (mis. *.vercel.app + *.onrender.com).
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  // Opsional: format cloudinary://<api_key>:<api_secret>@<cloud_name>. Kalau kosong,
  // endpoint foto profil mengembalikan 503 (fitur foto tidak aktif) — tidak mematikan app.
  CLOUDINARY_URL: z.string().min(1).optional(),
  CLOUDINARY_FOLDER: z.string().min(1).optional(),
  // Opsional: Google OAuth client ID (audience). Kalau kosong, endpoint oauth google 503.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  // Daftar origin untuk CORS (dari WEB_ORIGIN yang dipisah koma).
  webOrigins: parsed.WEB_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
};
