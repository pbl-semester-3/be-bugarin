import { Router } from "express";
import { asyncHandler } from "../../middlewares/async-handler";
import { db } from "../../config/db";
import { masterOlahraga, masterMakanan } from "../../db/schema";
import { authGuard } from "../../middlewares/auth-guard";
import { like } from "drizzle-orm";

const router = Router();

// Shared, semua role login boleh akses (lihat Bugarin_PRD_Backend_AI.md bab 4.4).

router.get(
  "/olahraga",
  authGuard(["klien", "pt", "admin"]),
  asyncHandler(async (req, res) => {
    const data = await db.select().from(masterOlahraga);
    res.json({ data });
  })
);

router.get(
  "/makanan",
  authGuard(["klien", "pt", "admin"]),
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const data = await db
      .select()
      .from(masterMakanan)
      .where(q ? like(masterMakanan.nama, `%${q}%`) : undefined);
    res.json({ data });
  })
);

export default router;
