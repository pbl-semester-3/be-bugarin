import { Router } from "express";
import { authGuard } from "../../middlewares/auth-guard";
import { adminController } from "./admin.controller";

const router = Router();

// Endpoint Profil Admin
router.get("/profile", authGuard(["admin"]), adminController.getProfile);
router.put("/profile", authGuard(["admin"]), adminController.updateProfile);
router.put("/password", authGuard(["admin"]), adminController.changePassword);
router.put("/theme", authGuard(["admin"]), adminController.changeTheme);

router.get("/ping", authGuard(["admin"]), (req, res) => {
  res.json({ data: `admin ${req.user?.id} ok` });
});

export default router;
