import { ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";
import { recordRequestLog } from "../utils/request-log";

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  const requestId = req.id ?? "-";
  const status = err instanceof ZodError ? 400 : err instanceof AppError ? err.statusCode : 500;
  const message =
    err instanceof ZodError
      ? "Validasi gagal"
      : err instanceof AppError
        ? err.message
        : "Internal server error";

  // Catat HANYA error (bukan semua request). Kegagalan insert tidak mengganggu respons.
  await recordRequestLog({
    requestId,
    userId: req.user?.id ?? null,
    role: req.user?.role ?? null,
    method: req.method,
    endpoint: req.path,
    status,
    message,
    durationMs: req.startedAt ? Date.now() - req.startedAt : 0,
  });

  if (err instanceof ZodError) {
    return res.status(400).json({ error: { fields: err.flatten().fieldErrors }, requestId });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, requestId });
  }
  console.error(`[requestId=${requestId}]`, err);
  return res.status(500).json({ error: "Internal server error", requestId });
}
