import { Router } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../middlewares/async-handler";
import { AppError } from "../middlewares/error-handler";
import { generateWeeklyPlanForAllActiveKlien } from "./generate-weekly-plan.job";

const router = Router();

function parsePositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, `${name} tidak valid`);
  return n;
}

// Dipanggil cron-job.org (lihat deploy/runbook.md §8). Dilindungi header rahasia,
// BUKAN authGuard biasa — ini bukan request dari user login.
router.post(
  "/generate-weekly-plan",
  asyncHandler(async (req, res) => {
    if (req.headers["x-cron-secret"] !== env.CRON_SECRET) {
      throw new AppError(401, "Unauthorized");
    }

    const klienId = parsePositiveInt(req.query.klienId, "klienId");
    const limitParam = parsePositiveInt(req.query.limit, "limit");
    // Default 1 bila menargetkan satu klien; selain itu 3 (aman: 3 x timeout AI 15s < 60s).
    const limit = Math.min(limitParam ?? (klienId !== undefined ? 1 : 3), 50);

    const count = await generateWeeklyPlanForAllActiveKlien({ limit, klienId });
    res.json({ data: { triggered: true, count } });
  })
);

export default router;
