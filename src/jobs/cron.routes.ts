import { Router } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../middlewares/async-handler";
import { AppError } from "../middlewares/error-handler";
import { generateWeeklyPlanForAllActiveKlien } from "./generate-weekly-plan.job";

const router = Router();

// Dipanggil cron-job.org (lihat SETUP.md bab 4). Dilindungi header rahasia,
// BUKAN authGuard biasa — ini bukan request dari user login.
router.post(
  "/generate-weekly-plan",
  asyncHandler(async (req, res) => {
    if (req.headers["x-cron-secret"] !== env.CRON_SECRET) {
      throw new AppError(401, "Unauthorized");
    }
    const count = await generateWeeklyPlanForAllActiveKlien();
    res.json({ data: { triggered: true, count } });
  })
);

export default router;
