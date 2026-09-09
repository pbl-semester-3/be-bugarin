import { Router } from "express";
import { asyncHandler } from "../../middlewares/async-handler";
import { register, login, logout } from "./auth.controller";

const router = Router();

router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
router.post("/logout", asyncHandler(logout));

export default router;
