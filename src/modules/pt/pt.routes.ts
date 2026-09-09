import { Router } from "express";
import { authGuard } from "../../middlewares/auth-guard";

const router = Router();

// TODO: implementasikan seluruh endpoint sesuai Bugarin_PRD_Backend_AI.md bab 4.2
// (profile + tempat_gym wajib, dashboard-summary, pairing-requests, klien detail + grafik,
// weekly-plan approve/override, riwayat, feedbacks).

router.get("/ping", authGuard(["pt"]), (req, res) => {
  res.json({ data: `pt ${req.user?.id} ok` });
});

export default router;
