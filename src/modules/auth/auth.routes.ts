import { Router } from "express";
import { asyncHandler } from "../../middlewares/async-handler";
import { register, login, oauthGoogle, logout } from "./auth.controller";

const router = Router();

router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
router.post("/oauth/google", asyncHandler(oauthGoogle));
router.post("/logout", asyncHandler(logout));

export default router;
