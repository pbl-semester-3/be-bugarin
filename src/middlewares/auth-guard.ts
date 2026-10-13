import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { db } from "../config/db";
import { users } from "../db/schema";
import { AppError } from "./error-handler";

type Role = "klien" | "pt" | "admin";

export function authGuard(allowedRoles: Role[]): RequestHandler {
  return async (req, res, next) => {
    const bearer = req.headers.authorization?.replace("Bearer ", "");
    const token = bearer ?? req.cookies?.token; // dukung Mobile (bearer) & Web (cookie)
    if (!token) return next(new AppError(401, "Unauthorized"));

    let decoded: { sub: number; role: Role };
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as unknown as { sub: number; role: Role };
    } catch {
      return next(new AppError(401, "Token tidak valid atau kedaluwarsa"));
    }

    if (!allowedRoles.includes(decoded.role)) {
      return next(new AppError(403, "Forbidden"));
    }

    // Opsi (b): cek is_active tiap request (tanpa cache) — sesi user nonaktif langsung ditolak.
    try {
      const user = await db.query.users.findFirst({ where: eq(users.id, decoded.sub) });
      if (!user || !user.isActive) {
        return next(new AppError(403, "Akun tidak aktif atau tidak ditemukan"));
      }
      req.user = { id: decoded.sub, role: decoded.role };
      next();
    } catch (error) {
      next(error);
    }
  };
}
