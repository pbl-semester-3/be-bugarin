import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "./error-handler";

type Role = "klien" | "pt" | "admin";

export function authGuard(allowedRoles: Role[]): RequestHandler {
  return (req, res, next) => {
    const bearer = req.headers.authorization?.replace("Bearer ", "");
    const token = bearer ?? req.cookies?.token; // dukung Mobile (bearer) & Web (cookie)
    if (!token) return next(new AppError(401, "Unauthorized"));

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as { sub: number; role: Role };
      if (!allowedRoles.includes(decoded.role)) {
        return next(new AppError(403, "Forbidden"));
      }
      req.user = { id: decoded.sub, role: decoded.role };
      next();
    } catch {
      next(new AppError(401, "Token tidak valid atau kedaluwarsa"));
    }
  };
}
