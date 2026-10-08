import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET minimal 32 karakter — generate: openssl rand -base64 32"),
  GEMINI_API_KEY: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CRON_SECRET: z.string().min(1),
  // Opsional: format cloudinary://<api_key>:<api_secret>@<cloud_name>. Kalau kosong,
  // endpoint foto profil mengembalikan 503 (fitur foto tidak aktif) — tidak mematikan app.
  CLOUDINARY_URL: z.string().min(1).optional(),
  CLOUDINARY_FOLDER: z.string().min(1).optional(),
  // Opsional: Google OAuth client ID (audience). Kalau kosong, endpoint oauth google 503.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
