import { ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  const requestId = req.id ?? "-";
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { fields: err.flatten().fieldErrors }, requestId });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, requestId });
  }
  console.error(`[requestId=${requestId}]`, err);
  return res.status(500).json({ error: "Internal server error", requestId });
}
