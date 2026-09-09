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
});

export const env = envSchema.parse(process.env);
