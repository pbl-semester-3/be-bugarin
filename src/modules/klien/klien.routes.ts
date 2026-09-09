import { Router } from "express";
import { authGuard } from "../../middlewares/auth-guard";

const router = Router();

// TODO: implementasikan seluruh endpoint sesuai Bugarin_PRD_Backend_AI.md bab 4.1
// (profile, weight-logs, progress-cycles, pairing-requests, dashboard-summary,
// weekly-plan, activity-logs, meal-logs, feedbacks). Pola: routes -> controller -> service.

router.get("/ping", authGuard(["klien"]), (req, res) => {
  res.json({ data: `klien ${req.user?.id} ok` });
});

export default router;
