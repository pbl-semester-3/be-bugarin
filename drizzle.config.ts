import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { parseMysqlUrl } from "./src/config/mysql-connection";

// Pakai host/port/user/password/database + ssl (bukan `url`) agar TLS ke Aiven bekerja —
// mysql2/drizzle-kit tidak memproses `ssl-mode` dari URL.
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: parseMysqlUrl(process.env.DATABASE_URL as string),
});
