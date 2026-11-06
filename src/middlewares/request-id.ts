import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

// Terima ID dari klien/proxy hanya bila formatnya aman; selain itu generate UUID.
const VALID_INCOMING_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/**
 * Memberi setiap request sebuah ID unik agar error bisa ditelusuri:
 * - `req.id` untuk dipakai handler/log
 * - header `x-request-id` pada semua respons
 * - log (console.warn) HANYA untuk respons error (status >= 400)
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  const id = incoming && VALID_INCOMING_ID.test(incoming) ? incoming : randomUUID();

  req.id = id;
  req.startedAt = Date.now();
  res.setHeader("x-request-id", id);

  res.on("finish", () => {
    if (res.statusCode >= 400) {
      console.warn(`[requestId=${id}] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    }
  });

  next();
};
