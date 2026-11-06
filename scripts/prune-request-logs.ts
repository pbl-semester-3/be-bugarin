// Hapus request_logs yang lebih lama dari N hari (default 30) untuk membatasi ukuran tabel.
// Jalankan: npm run db:prune-request-logs
// (Opsional) jadwalkan lewat cron/serverless cron.
import { lt } from "drizzle-orm";
import { db } from "../src/config/db";
import { requestLogs } from "../src/db/schema";

const RETAIN_DAYS = Number(process.env.REQUEST_LOG_RETAIN_DAYS ?? 30);

async function main() {
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(requestLogs).where(lt(requestLogs.createdAt, cutoff));
  console.log(
    `prune-request-logs: menghapus data sebelum ${cutoff.toISOString()} (retensi ${RETAIN_DAYS} hari). Selesai.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("prune-request-logs gagal:", err);
  process.exit(1);
});
