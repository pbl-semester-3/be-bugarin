import { Router } from "express";
import { authGuard } from "../../middlewares/auth-guard";
import { klienController } from "./klien.controller";

const router = Router();

// Endpoint Profil & Onboarding
router.get("/profile", authGuard(["klien"]), klienController.getProfile);
router.put("/profile", authGuard(["klien"]), klienController.updateProfile);
router.put("/password", authGuard(["klien"]), klienController.changePassword);
router.put("/theme", authGuard(["klien"]), klienController.changeTheme);

// Endpoint Siklus Progres & Weight Log
router.post("/weight-logs", authGuard(["klien"]), klienController.addWeightLog);
router.get("/progress-cycles", authGuard(["klien"]), klienController.getProgressCycles);
router.post("/progress-cycles", authGuard(["klien"]), klienController.startNewProgressCycle);
router.get("/progress-cycles/:id/logs", authGuard(["klien"]), klienController.getCycleLogs);

// Endpoint Progres Klien
router.post("/activity-logs", authGuard(["klien"]), klienController.createActivityLog);
router.post("/meal-logs", authGuard(["klien"]), klienController.createMealLog);
router.get("/weekly-plan/current", authGuard(["klien"]), klienController.getCurrentWeeklyPlan);

// Pairing Requests
router.post("/pairing-requests", authGuard(["klien"]), klienController.sendPairingRequest);
router.get("/pairing-requests/current", authGuard(["klien"]), klienController.getCurrentPairingRequest);

router.get("/ping", authGuard(["klien"]), (req, res) => {
  res.json({ data: `klien ${req.user?.id} ok` });
});

export default router;
