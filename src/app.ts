import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { errorHandler } from "./middlewares/error-handler";

import authRoutes from "./modules/auth/auth.routes";
import klienRoutes from "./modules/klien/klien.routes";
import ptRoutes from "./modules/pt/pt.routes";
import adminRoutes from "./modules/admin/admin.routes";
import masterDataRoutes from "./modules/master-data/master-data.routes";
import cronRoutes from "./jobs/cron.routes";

export function createApp() {
  const app = express();

  // Di belakang reverse proxy (Render) — agar IP/protokol benar & rate-limit tidak warning.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    cors({
      origin: env.webOrigins, // daftar origin dari WEB_ORIGIN (boleh dipisah koma)
      credentials: true,
    })
  );

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
  app.use("/auth", authLimiter);

  app.get("/health", (req, res) => res.json({ data: "ok" }));

  app.use("/auth", authRoutes);
  app.use("/klien", klienRoutes);
  app.use("/pt", ptRoutes);
  app.use("/admin", adminRoutes);
  app.use("/master", masterDataRoutes);
  app.use("/internal/jobs", cronRoutes);

  app.use(errorHandler);

  return app;
}

// Vercel (preset Express) mendeteksi file ini sebagai entry backend dan mewajibkan
// default export berupa app/handler — tanpa ini, GET / gagal ("Invalid export").
export default createApp();
