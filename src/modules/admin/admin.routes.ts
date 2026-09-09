import { Router } from "express";
import { authGuard } from "../../middlewares/auth-guard";

const router = Router();

// TODO: implementasikan seluruh endpoint sesuai Bugarin_PRD_Backend_AI.md bab 4.3
// (profile, dashboard-summary, users CRUD + POST /admin/users/pt buat akun PT baru
// LANGSUNG tanpa approval, riwayat gabungan feedback+admin_activity_logs).

router.get("/ping", authGuard(["admin"]), (req, res) => {
  res.json({ data: `admin ${req.user?.id} ok` });
});

export default router;
