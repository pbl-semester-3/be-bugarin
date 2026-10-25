import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { registerSchema, loginSchema, oauthGoogleSchema, forgotPasswordSchema, resetPasswordSchema } from "./auth.schema";
import * as authService from "./auth.service";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 hari, samakan dengan expiresIn token

function isWebClient(req: Request) {
  return req.headers["x-client-type"] === "web";
}

// Opsi cookie web terpusat. sameSite dari env (default "lax"); "none" wajib secure.
function setAuthCookie(res: Response, token: string) {
  const sameSite = env.COOKIE_SAMESITE;
  const secure = env.NODE_ENV === "production" || sameSite === "none";
  if (sameSite === "none" && !secure) {
    console.warn("COOKIE_SAMESITE=none tetapi cookie tidak Secure — browser bisa menolaknya.");
  }
  res.cookie("token", token, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const user = await authService.registerKlien(input);
    const token = authService.issueToken(user);

    if (isWebClient(req)) {
      setAuthCookie(res, token);
      return res.status(201).json({ data: { role: user.role } });
    }
    return res.status(201).json({ data: { token, role: user.role } });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const { token, role } = await authService.login(input);

    if (isWebClient(req)) {
      setAuthCookie(res, token);
      return res.json({ data: { role } });
    }
    return res.json({ data: { token, role } });
  } catch (err) {
    next(err);
  }
}

export async function oauthGoogle(req: Request, res: Response, next: NextFunction) {
  try {
    const input = oauthGoogleSchema.parse(req.body);
    const { token, role } = await authService.loginWithGoogle(input.idToken);

    if (isWebClient(req)) {
      setAuthCookie(res, token);
      return res.json({ data: { role } });
    }
    return res.json({ data: { token, role } });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response) {
  res.clearCookie("token");
  res.json({ data: "ok" });
}

// GET /auth/me — dipakai FE untuk menentukan role pada guard server-side.
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    // authGuard menjamin req.user terisi & akun aktif.
    const userId = req.user!.id;
    const data = await authService.getMe(userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(input);
    return res.json({ data: "ok" });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const input = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(input);
    return res.json({ data: "ok" });
  } catch (err) {
    next(err);
  }
}
