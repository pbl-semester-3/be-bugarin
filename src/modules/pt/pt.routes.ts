import { Router } from "express";
import { authGuard } from "../../middlewares/auth-guard";
import { ptController } from "./pt.controller";

const router = Router();

// Endpoint Profil PT
router.get("/profile", authGuard(["pt"]), ptController.getProfile);
router.put("/profile", authGuard(["pt"]), ptController.updateProfile);
router.put("/password", authGuard(["pt"]), ptController.changePassword);
router.put("/theme", authGuard(["pt"]), ptController.changeTheme);

// Endpoint PT Ku (Rekomendasi PT untuk Klien)
// Harus di-mount di /pt (di app.ts: app.use("/pt", ptRoutes))
router.get("/recommendations", authGuard(["klien"]), ptController.getPtRecommendations);

// Endpoint merespon request pairing (Oleh PT)
router.get("/pairing-requests", authGuard(["pt"]), ptController.getPairingRequests);
router.put("/pairing-requests/:id", authGuard(["pt"]), ptController.respondPairingRequest);

router.get("/ping", authGuard(["pt"]), (req, res) => {
  res.json({ data: `pt ${req.user?.id} ok` });
});

export default router;
