import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../middlewares/async-handler";
import { authGuard } from "../../middlewares/auth-guard";
import { register, login, oauthGoogle, logout, me, forgotPassword, resetPassword } from "./auth.controller";

const router = Router();

// Limiter ketat khusus lupa sandi: anti brute-force kode 6 digit (per IP).
// Instance terpisah per route agar kuota tidak saling mengurangi.
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Coba lagi nanti." },
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan. Coba lagi nanti." },
});

router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
router.post("/oauth/google", asyncHandler(oauthGoogle));
router.post("/logout", asyncHandler(logout));
router.get("/me", authGuard(["klien", "pt", "admin"]), asyncHandler(me));
router.post("/forgot-password", forgotLimiter, asyncHandler(forgotPassword));
router.post("/reset-password", resetLimiter, asyncHandler(resetPassword));

export default router;
