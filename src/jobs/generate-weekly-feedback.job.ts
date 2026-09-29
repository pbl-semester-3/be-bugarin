import { and, eq, sql } from "drizzle-orm";
import { db } from "../config/db";
import { klienProfiles, progressCycles, feedbacks } from "../db/schema";
import { generateWeeklyFeedback } from "../modules/ai/feedback";
import { klienService } from "../modules/klien/klien.service";

export async function generateWeeklyFeedbackForAllActiveKlien(klienIds?: number[]) {
  const klienQuery = db.select().from(klienProfiles);
  
  const klienList = await klienQuery;
  const filteredKlienList = klienIds ? klienList.filter(k => klienIds.includes(k.id)) : klienList;

  let count = 0;
  for (const klien of filteredKlienList) {
    try {
      const [cycle] = await db
        .select()
        .from(progressCycles)
        .where(and(eq(progressCycles.klienId, klien.id), eq(progressCycles.status, "aktif")))
        .limit(1);
      
      if (!cycle) continue;

      // Cek anti-duplikasi: apakah AI sudah memberi feedback dalam 7 hari terakhir
      const [lastFeedback] = await db
        .select({ maxCreatedAt: sql<string>`MAX(created_at)` })
        .from(feedbacks)
        .where(
          and(
            eq(feedbacks.klienId, klien.id),
            eq(feedbacks.source, "ai")
          )
        );

      if (lastFeedback?.maxCreatedAt) {
        const lastDate = new Date(lastFeedback.maxCreatedAt);
        const now = new Date();
        const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays < 7) {
          continue; // Lewati jika belum 7 hari
        }
      }

      // Ambil log 7 hari ke belakang via getCycleLogs
      // getCycleLogs expect userId (klien.userId), bukan klienProfile.id
      const cycleLogs = await klienService.getCycleLogs(klien.userId, cycle.id);
      
      // Filter log hanya untuk 7 hari terakhir (asumsi cycleLogs sudah terurut ascending)
      const nowStr = new Date().toISOString().slice(0, 10);
      const sevenDaysAgoDate = new Date();
      sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgoDate.toISOString().slice(0, 10);

      const recentLogs = cycleLogs.filter(log => log.tanggal >= sevenDaysAgoStr && log.tanggal <= nowStr);

      const totalHariKosong = 7 - recentLogs.length;

      // Generate feedback
      const pesan = await generateWeeklyFeedback({
        tujuan: cycle.tujuan,
        targetKaloriPerHari: cycle.targetKaloriPerHari,
        totalHariKosong: totalHariKosong > 0 ? totalHariKosong : 0,
        logs: recentLogs,
      });

      // Insert ke feedbacks tabel
      await db.insert(feedbacks).values({
        klienId: klien.id,
        ptId: null, // Feedback dari AI
        source: "ai",
        pesan: pesan,
      });

      count++;
    } catch (error) {
      console.error(`Gagal generate weekly feedback untuk klien ${klien.id}:`, error);
      // Lanjut ke klien berikutnya (fault-tolerance)
      continue;
    }
  }

  console.log(`generateWeeklyFeedbackForAllActiveKlien: ${count} feedback digenerate`);
  return count;
}
