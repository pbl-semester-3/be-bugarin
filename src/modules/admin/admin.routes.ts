import { Router } from "express";
import { authGuard } from "../../middlewares/auth-guard";
import { adminController } from "./admin.controller";

const router = Router();

// Endpoint Profil Admin
router.get("/profile", authGuard(["admin"]), adminController.getProfile);
router.put("/profile", authGuard(["admin"]), adminController.updateProfile);
router.put("/password", authGuard(["admin"]), adminController.changePassword);
router.put("/theme", authGuard(["admin"]), adminController.changeTheme);

// Endpoint Dashboard Admin
router.get("/dashboard-summary", authGuard(["admin"]), adminController.getDashboardSummary);

// Endpoint Riwayat Admin
router.get("/riwayat", authGuard(["admin"]), adminController.getRiwayat);

// Endpoint CRUD User
router.get("/users", authGuard(["admin"]), adminController.listUsers);
router.post("/users/pt", authGuard(["admin"]), adminController.createPt);
router.put("/users/:id", authGuard(["admin"]), adminController.updateUser);
router.delete("/users/:id", authGuard(["admin"]), adminController.deleteUser);

router.get("/ping", authGuard(["admin"]), (req, res) => {
  res.json({ data: `admin ${req.user?.id} ok` });
});

export default router;
