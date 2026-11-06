import { db } from "../config/db";
import { requestLogs } from "../db/schema";

type RequestLogInput = {
  requestId: string;
  userId: number | null;
  role: "klien" | "pt" | "admin" | null;
  method: string;
  endpoint: string;
  status: number;
  message: string;
  durationMs: number;
};

/**
 * Simpan log error per request. Dibungkus try/catch agar kegagalan mencatat log
 * TIDAK PERNAH mengganggu respons error ke klien.
 */
export async function recordRequestLog(input: RequestLogInput): Promise<void> {
  try {
    await db.insert(requestLogs).values({
      requestId: input.requestId,
      userId: input.userId,
      role: input.role,
      method: input.method,
      endpoint: input.endpoint.slice(0, 255),
      status: input.status,
      message: input.message.slice(0, 255),
      durationMs: input.durationMs,
    });
  } catch (err) {
    console.error(`[requestId=${input.requestId}] gagal menyimpan request log:`, err);
  }
}
