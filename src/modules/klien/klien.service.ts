import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { db } from "../../config/db";
import { klienProfiles, progressCycles, weightLogs, users, weeklyPlans, activityLogs, masterOlahraga, mealLogs, masterMakanan, ptProfiles, pairingRequests, feedbacks, type WorkoutPlanItem } from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import { cloudinary, isCloudinaryConfigured, buildCloudinaryUrl } from "../../config/cloudinary";
import { env } from "../../config/env";
import * as argon2 from "argon2";
import { calculateTargetKalori } from "../../utils/kalori";
import { getStartOfWeekUtc } from "../../utils/week";
import { generateWeeklyPlan } from "../ai/weekly-plan";
import { estimateFoodCalories } from "../ai/food-estimation";
import type { 
  UpdateProfileInput, 
  ChangePasswordInput, 
  ChangeThemeInput, 
  WeightLogInput, 
  NewCycleInput,
  CreateActivityLogInput,
  CreateMealLogInput
} from "./klien.schema";

export type DashboardSummary = {
  pt: { id: number; nama: string; spesialisasi: "turun_bb" | "naik_bb" | null } | null;
  targetKaloriHariIni: number | null;
  kaloriMasukHariIni: number | null;
  streak: number;
  jadwalMingguan: WorkoutPlanItem[];
  isReminderActive: boolean;
  unreadFeedbackCount: number;
};

function shiftUtcDate(dateStr: string, deltaDays: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

async function getCurrentWeeklyPlanRecord(klienProfileId: number) {
  const startOfWeek = getStartOfWeekUtc();

  return db.query.weeklyPlans.findFirst({
    where: and(
      eq(weeklyPlans.klienId, klienProfileId),
      eq(weeklyPlans.mingguMulai, startOfWeek),
    ),
    orderBy: [desc(weeklyPlans.generatedAt)],
  });
}

// Cegah duplikat baris weekly_plans untuk (klien, minggu) yang sama — penting karena
// cron bisa terpanggil lebih dari sekali dalam seminggu. Lihat CATATAN.
async function hasWeeklyPlanForWeek(klienId: number, mingguMulai: string): Promise<boolean> {
  const existing = await db.query.weeklyPlans.findFirst({
    where: and(eq(weeklyPlans.klienId, klienId), eq(weeklyPlans.mingguMulai, mingguMulai)),
  });
  return Boolean(existing);
}

// Streak = jumlah hari unik (activity_logs OR meal_logs) di dalam window siklus.
// Dipakai untuk update realtime saat insert log. Lihat CATATAN.md.
async function computeCycleStreak(klienId: number, mulai: string, akhir: string): Promise<number> {
  const activityRows = await db
    .selectDistinct({ tanggal: activityLogs.tanggal })
    .from(activityLogs)
    .where(and(
      eq(activityLogs.klienId, klienId),
      gte(activityLogs.tanggal, mulai),
      lte(activityLogs.tanggal, akhir),
    ));

  const mealRows = await db
    .selectDistinct({ tanggal: mealLogs.tanggal })
    .from(mealLogs)
    .where(and(
      eq(mealLogs.klienId, klienId),
      gte(mealLogs.tanggal, mulai),
      lte(mealLogs.tanggal, akhir),
    ));

  const distinctDates = new Set<string>();
  for (const row of activityRows) distinctDates.add(row.tanggal);
  for (const row of mealRows) distinctDates.add(row.tanggal);
  return distinctDates.size;
}

export async function recalculateActiveCycleStreak(klienId: number): Promise<number> {
  const activeCycle = await db.query.progressCycles.findFirst({
    where: and(eq(progressCycles.klienId, klienId), eq(progressCycles.status, "aktif")),
    orderBy: [desc(progressCycles.tanggalMulai)],
  });
  if (!activeCycle) return 0;

  const akhir =
    activeCycle.status === "selesai" && activeCycle.tanggalSelesai
      ? activeCycle.tanggalSelesai
      : new Date().toISOString().slice(0, 10);

  const streak = await computeCycleStreak(klienId, activeCycle.tanggalMulai, akhir);
  await db.update(progressCycles).set({ streak }).where(eq(progressCycles.id, activeCycle.id));
  return streak;
}

// Resolusi makanan: pakai `makananId` (master) atau `namaMakanan` (cari master,
// lalu estimasi AI + simpan ke master bila belum ada). Dipakai bersama oleh
// createMealLog dan estimateMakanan.
async function resolveMakanan(data: {
  makananId?: number;
  namaMakanan?: string;
}): Promise<{ makananId: number; namaMakanan: string; kaloriPer100g: number; kategori: string }> {
  if (data.makananId) {
    const makanan = await db.query.masterMakanan.findFirst({
      where: eq(masterMakanan.id, data.makananId),
    });
    if (!makanan) throw new AppError(404, "Makanan tidak ditemukan");
    return {
      makananId: makanan.id,
      namaMakanan: makanan.nama,
      kaloriPer100g: makanan.kaloriPer100g,
      kategori: makanan.kategori,
    };
  }

  if (data.namaMakanan) {
    const searchNama = data.namaMakanan;
    const makanan = await db.query.masterMakanan.findFirst({
      where: sql`LOWER(${masterMakanan.nama}) = LOWER(${searchNama})`,
    });

    if (makanan) {
      return {
        makananId: makanan.id,
        namaMakanan: makanan.nama,
        kaloriPer100g: makanan.kaloriPer100g,
        kategori: makanan.kategori,
      };
    }

    const estimated = await estimateFoodCalories(searchNama);
    try {
      const [insertMakanan] = await db.insert(masterMakanan).values({
        nama: searchNama,
        kaloriPer100g: estimated.kaloriPer100g,
        kategori: estimated.kategori,
        sumber: "ai_generated",
      });
      return {
        makananId: insertMakanan.insertId,
        namaMakanan: searchNama,
        kaloriPer100g: estimated.kaloriPer100g,
        kategori: estimated.kategori,
      };
    } catch (error) {
      const err = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
      const code = err.code || err.cause?.code;
      const errno = err.errno || err.cause?.errno;
      if (code === "ER_DUP_ENTRY" || errno === 1062) {
        const existing = await db.query.masterMakanan.findFirst({
          where: sql`LOWER(${masterMakanan.nama}) = LOWER(${searchNama})`,
        });
        if (!existing) throw new AppError(500, "Terjadi kesalahan saat memproses makanan unik");
        return {
          makananId: existing.id,
          namaMakanan: existing.nama,
          kaloriPer100g: existing.kaloriPer100g,
          kategori: existing.kategori,
        };
      }
      throw error;
    }
  }

  throw new AppError(400, "Harus mengirim makananId atau namaMakanan");
}

export const klienService = {
  async getProfile(klienId: number) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, klienId),
      with: { user: true },
    });

    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    const activeCycle = await db.query.progressCycles.findFirst({
      where: and(eq(progressCycles.klienId, profile.id), eq(progressCycles.status, "aktif")),
    });

    const lastWeight = await db.query.weightLogs.findFirst({
      where: eq(weightLogs.klienId, profile.id),
      orderBy: [desc(weightLogs.tanggal), desc(weightLogs.id)],
    });

    const isProfileComplete = Boolean(
      profile.usia && 
      profile.jenisKelamin && 
      profile.tinggiBadanCm && 
      activeCycle
    );

    // Mapping eksplisit — JANGAN spread mentah (cegah kebocoran passwordHash & field internal users).
    return {
      id: profile.id,
      userId: profile.userId,
      nama: profile.nama,
      usia: profile.usia,
      jenisKelamin: profile.jenisKelamin,
      alergiMakanan: profile.alergiMakanan,
      tinggiBadanCm: profile.tinggiBadanCm,
      ptId: profile.ptId,
      user: {
        email: profile.user.email,
        username: profile.user.username,
        tema: profile.user.tema,
        role: profile.user.role,
      },
      profileComplete: isProfileComplete,
      activeCycle: activeCycle ?? null,
      bbSekarangKg: lastWeight?.beratBadanKg ?? null,
      fotoUrl: buildCloudinaryUrl(profile.fotoPublicId),
      createdAt: profile.user.createdAt,
    };
  },

  async uploadProfilePhoto(userId: number, file: Express.Multer.File) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    if (!isCloudinaryConfigured()) {
      throw new AppError(503, "Layanan foto belum dikonfigurasi");
    }

    const result = await new Promise<{ public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: env.CLOUDINARY_FOLDER, resource_type: "image" },
        (error, uploaded) => {
          if (error || !uploaded) {
            reject(error ?? new Error("Upload foto gagal"));
            return;
          }
          resolve(uploaded);
        },
      );
      stream.end(file.buffer);
    });

    const oldPublicId = profile.fotoPublicId;
    await db.update(klienProfiles)
      .set({ fotoPublicId: result.public_id })
      .where(eq(klienProfiles.id, profile.id));

    if (oldPublicId && oldPublicId !== result.public_id) {
      await cloudinary.uploader.destroy(oldPublicId).catch(() => undefined);
    }

    return { fotoUrl: buildCloudinaryUrl(result.public_id) };
  },

  async deleteProfilePhoto(userId: number) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    if (!profile.fotoPublicId) {
      throw new AppError(404, "Foto tidak ditemukan");
    }

    if (isCloudinaryConfigured()) {
      await cloudinary.uploader.destroy(profile.fotoPublicId).catch(() => undefined);
    }

    await db.update(klienProfiles)
      .set({ fotoPublicId: null })
      .where(eq(klienProfiles.id, profile.id));

    return { fotoUrl: null };
  },

  async updateProfile(userId: number, data: UpdateProfileInput) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });

    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    await db.update(klienProfiles)
      .set(data)
      .where(eq(klienProfiles.id, profile.id));

    return db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.id, profile.id),
    });
  },

  async changePassword(userId: number, data: ChangePasswordInput) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) throw new AppError(404, "User tidak ditemukan");

    const isMatch = await argon2.verify(user.passwordHash, data.passwordSaatIni);
    if (!isMatch) throw new AppError(400, "Password saat ini salah");

    const newHash = await argon2.hash(data.passwordBaru);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

    return { message: "Password berhasil diubah" };
  },

  async changeTheme(userId: number, data: ChangeThemeInput) {
    await db.update(users).set({ tema: data.tema }).where(eq(users.id, userId));
    return { tema: data.tema };
  },

  async addWeightLog(userId: number, data: WeightLogInput) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });

    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    const activeCycle = await db.query.progressCycles.findFirst({
      where: and(eq(progressCycles.klienId, profile.id), eq(progressCycles.status, "aktif")),
    });

    await db.transaction(async (tx) => {
      await tx.insert(weightLogs).values({
        klienId: profile.id,
        beratBadanKg: data.beratBadanKg,
        tanggal: new Date().toISOString().slice(0, 10),
      });

      if (activeCycle) {
        const goalReached = 
          (activeCycle.tujuan === "turun_bb" && data.beratBadanKg <= activeCycle.bbTujuanKg) ||
          (activeCycle.tujuan === "naik_bb" && data.beratBadanKg >= activeCycle.bbTujuanKg);

        if (goalReached) {
          await tx.update(progressCycles)
            .set({ status: "selesai", tanggalSelesai: new Date().toISOString().slice(0, 10) })
            .where(eq(progressCycles.id, activeCycle.id));
        }
      }
    });

    return { message: "Log berat badan berhasil ditambahkan" };
  },

  async getProgressCycles(userId: number) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });

    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    return db.query.progressCycles.findMany({
      where: eq(progressCycles.klienId, profile.id),
      orderBy: [desc(progressCycles.tanggalMulai)],
    });
  },

  async startNewProgressCycle(userId: number, data: NewCycleInput) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
      with: { pt: true },
    });

    if (!profile) throw new AppError(404, "Profil tidak ditemukan");
    if (!profile.usia || !profile.jenisKelamin || !profile.tinggiBadanCm) {
      throw new AppError(422, "Lengkapi profil (usia, jenis kelamin, tinggi badan) sebelum memulai siklus");
    }

    const lastWeightLog = await db.query.weightLogs.findFirst({
      where: eq(weightLogs.klienId, profile.id),
      orderBy: [desc(weightLogs.tanggal), desc(weightLogs.id)],
    });

    let bbAwal = lastWeightLog?.beratBadanKg;

    if (!bbAwal) {
      if (!data.bbAwalKg) {
        throw new AppError(422, "Harap masukkan bbAwalKg untuk siklus pertama");
      }
      bbAwal = data.bbAwalKg;
    }

    const targetKalori = calculateTargetKalori(
      bbAwal,
      profile.tinggiBadanCm,
      profile.usia,
      profile.jenisKelamin,
      data.tujuan
    );

    await db.transaction(async (tx) => {
      await tx.update(progressCycles)
        .set({ status: "selesai", tanggalSelesai: new Date().toISOString().slice(0, 10) })
        .where(and(eq(progressCycles.klienId, profile.id), eq(progressCycles.status, "aktif")));

      if (!lastWeightLog) {
        await tx.insert(weightLogs).values({
          klienId: profile.id,
          beratBadanKg: bbAwal!,
          tanggal: new Date().toISOString().slice(0, 10),
        });
      }

      await tx.insert(progressCycles).values({
        klienId: profile.id,
        bbAwalKg: bbAwal!,
        bbTujuanKg: data.bbTujuanKg,
        tujuan: data.tujuan,
        durasiHari: data.durasiHari,
        targetKaloriPerHari: targetKalori,
        status: "aktif",
        tanggalMulai: new Date().toISOString().slice(0, 10),
      });
    });

    // Side-effect: generate weekly plan
    if (profile.ptId && profile.pt) {
      generateWeeklyPlan({
        tinggiBadanCm: profile.tinggiBadanCm,
        alergiMakanan: profile.alergiMakanan,
        bbAwalKg: bbAwal,
        bbSekarangKg: bbAwal, // saat baru mulai, awal === sekarang
        bbTujuanKg: data.bbTujuanKg,
        tujuan: data.tujuan,
        tempatGym: profile.pt.tempatGym || "",
      })
      .then(async (plan) => {
        const startOfWeek = getStartOfWeekUtc();

        if (await hasWeeklyPlanForWeek(profile.id, startOfWeek)) return;

        await db.insert(weeklyPlans).values({
          klienId: profile.id,
          mingguMulai: startOfWeek,
          workoutPlan: plan.workoutPlan,
          mealPlan: plan.mealPlan,
          status: "disetujui",
        });
      })
      .catch(console.error);
    }

    return { message: "Siklus progres berhasil dimulai" };
  },

  async createActivityLog(userId: number, data: CreateActivityLogInput) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    const olahraga = await db.query.masterOlahraga.findFirst({
      where: eq(masterOlahraga.id, data.olahragaId)
    });
    if (!olahraga) throw new AppError(404, "Jenis olahraga tidak ditemukan");

    let jarakMeter = data.jarakMeter ?? null;
    if (olahraga.butuhJarak) {
      if (!jarakMeter || jarakMeter <= 0) {
        throw new AppError(400, "Jarak wajib diisi untuk olahraga ini");
      }
    } else {
      jarakMeter = null; 
    }

    if (data.weeklyPlanId) {
      const plan = await db.query.weeklyPlans.findFirst({
        where: and(eq(weeklyPlans.id, data.weeklyPlanId), eq(weeklyPlans.klienId, profile.id))
      });
      if (!plan) throw new AppError(404, "Weekly plan tidak ditemukan atau bukan milik Anda");
    }

    const lastWeightLog = await db.query.weightLogs.findFirst({
      where: eq(weightLogs.klienId, profile.id),
      orderBy: [desc(weightLogs.tanggal), desc(weightLogs.id)],
    });

    if (!lastWeightLog) {
      throw new AppError(422, "Berat badan belum tercatat. Lengkapi profil terlebih dahulu.");
    }

    const kaloriTerbakar = Math.round(olahraga.metValue * lastWeightLog.beratBadanKg * (data.durasiMenit / 60));
    const tanggal = new Date().toISOString().slice(0, 10);

    const [insertResult] = await db.insert(activityLogs).values({
      klienId: profile.id,
      olahragaId: olahraga.id,
      durasiMenit: data.durasiMenit,
      jarakMeter,
      kaloriTerbakar,
      tanggal,
      weeklyPlanId: data.weeklyPlanId || null,
    });

    await recalculateActiveCycleStreak(profile.id);

    return {
      id: insertResult.insertId,
      olahragaId: olahraga.id,
      durasiMenit: data.durasiMenit,
      jarakMeter,
      kaloriTerbakar,
      tanggal,
      weeklyPlanId: data.weeklyPlanId || null,
    };
  },

  async createMealLog(userId: number, data: CreateMealLogInput) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    if (data.weeklyPlanId) {
      const plan = await db.query.weeklyPlans.findFirst({
        where: and(eq(weeklyPlans.id, data.weeklyPlanId), eq(weeklyPlans.klienId, profile.id))
      });
      if (!plan) throw new AppError(404, "Weekly plan tidak ditemukan atau bukan milik Anda");
    }

    const {
      makananId: resolvedMakananId,
      namaMakanan: resolvedNamaMakanan,
      kaloriPer100g,
    } = await resolveMakanan(data);

    const kaloriMasuk = Math.round(kaloriPer100g * (data.porsiGram / 100));
    const tanggal = new Date().toISOString().slice(0, 10);

    const [insertResult] = await db.insert(mealLogs).values({
      klienId: profile.id,
      makananId: resolvedMakananId,
      porsiGram: data.porsiGram,
      kaloriMasuk,
      tanggal,
      weeklyPlanId: data.weeklyPlanId || null,
    });

    await recalculateActiveCycleStreak(profile.id);

    return {
      id: insertResult.insertId,
      makananId: resolvedMakananId,
      namaMakanan: resolvedNamaMakanan,
      porsiGram: data.porsiGram,
      kaloriMasuk,
      tanggal,
      weeklyPlanId: data.weeklyPlanId || null,
    };
  },

  // Estimasi kalori makanan TANPA membuat meal log — dipakai mobile untuk
  // menampilkan kkal per item saat klien menambah menu (staging/draft).
  async estimateMakanan(data: { namaMakanan: string }) {
    const resolved = await resolveMakanan({ namaMakanan: data.namaMakanan });
    return {
      makananId: resolved.makananId,
      namaMakanan: resolved.namaMakanan,
      kaloriPer100g: resolved.kaloriPer100g,
      kategori: resolved.kategori,
    };
  },

  async getCurrentWeeklyPlan(userId: number) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    const plan = await getCurrentWeeklyPlanRecord(profile.id);

    if (!plan || (plan.status !== "disetujui" && plan.status !== "override")) return null;

    return {
      id: plan.id,
      mingguMulai: plan.mingguMulai,
      status: plan.status,
      workoutPlan: plan.workoutPlan,
      mealPlan: plan.mealPlan,
    };
  },

  async getDashboardSummary(userId: number): Promise<DashboardSummary> {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
      with: { pt: true },
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    const today = new Date().toISOString().slice(0, 10);

    const [activeCycle, weeklyPlan, unreadRows, mealRows] = await Promise.all([
      db.query.progressCycles.findFirst({
        where: and(eq(progressCycles.klienId, profile.id), eq(progressCycles.status, "aktif")),
        orderBy: [desc(progressCycles.tanggalMulai)],
      }),
      getCurrentWeeklyPlanRecord(profile.id),
      db.select({ total: sql<number>`COUNT(*)` })
        .from(feedbacks)
        .where(and(eq(feedbacks.klienId, profile.id), eq(feedbacks.dibaca, false))),
      db.select({ total: sql<string>`SUM(${mealLogs.kaloriMasuk})` })
        .from(mealLogs)
        .where(and(eq(mealLogs.klienId, profile.id), eq(mealLogs.tanggal, today))),
    ]);

    const streak = activeCycle ? activeCycle.streak : 0;
    const kaloriMasukHariIni = activeCycle ? Number(mealRows[0]?.total ?? 0) : null;

    const jadwalMingguan =
      weeklyPlan && weeklyPlan.status !== "pending_review" ? weeklyPlan.workoutPlan : [];

    const isReminderActive = activeCycle
      ? today > shiftUtcDate(activeCycle.tanggalMulai, activeCycle.durasiHari)
      : false;

    const pt = profile.ptId && profile.pt
      ? { id: profile.pt.id, nama: profile.pt.nama, spesialisasi: profile.pt.spesialisasi }
      : null;

    return {
      pt,
      targetKaloriHariIni: activeCycle ? activeCycle.targetKaloriPerHari : null,
      kaloriMasukHariIni,
      streak,
      jadwalMingguan,
      isReminderActive,
      unreadFeedbackCount: Number(unreadRows[0]?.total ?? 0),
    };
  },

  async sendPairingRequest(klienUserId: number, data: { ptId: number }) {
    const klienProfile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, klienUserId),
    });

    if (!klienProfile) throw new AppError(404, "Profil tidak ditemukan");

    if (klienProfile.ptId === data.ptId) {
      throw new AppError(409, "Kamu sudah dipasangkan dengan PT ini.");
    }

    const ptProfile = await db.query.ptProfiles.findFirst({
      where: eq(ptProfiles.id, data.ptId),
    });

    if (!ptProfile) throw new AppError(404, "PT tidak ditemukan");

    const existingPending = await db.query.pairingRequests.findFirst({
      where: and(
        eq(pairingRequests.klienId, klienProfile.id),
        eq(pairingRequests.status, "pending")
      ),
    });

    if (existingPending) {
      throw new AppError(409, "Kamu sudah punya request yang sedang menunggu. Batalkan atau tunggu responsnya.");
    }

    const [insertReq] = await db.insert(pairingRequests).values({
      klienId: klienProfile.id,
      ptId: data.ptId,
      status: "pending",
    });

    const newReq = await db.query.pairingRequests.findFirst({
      where: eq(pairingRequests.id, insertReq.insertId),
    });

    return {
      id: newReq!.id,
      status: newReq!.status,
      createdAt: newReq!.createdAt,
    };
  },

  async getCurrentPairingRequest(klienUserId: number) {
    const klienProfile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, klienUserId),
    });

    if (!klienProfile) throw new AppError(404, "Profil tidak ditemukan");

    const request = await db.query.pairingRequests.findFirst({
      where: eq(pairingRequests.klienId, klienProfile.id),
      orderBy: [desc(pairingRequests.createdAt)],
      with: {
        pt: true
      }
    });

    if (!request) return null;

    return {
      id: request.id,
      status: request.status,
      alasanPenolakan: request.alasanPenolakan,
      createdAt: request.createdAt,
      pt: {
        id: request.pt.id,
        nama: request.pt.nama,
        spesialisasi: request.pt.spesialisasi,
        tempatGym: request.pt.tempatGym,
      }
    };
  },

  async getCycleLogs(userId: number, cycleId: number) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });

    if (!profile) throw new AppError(404, "Siklus tidak ditemukan");

    const cycle = await db.query.progressCycles.findFirst({
      where: eq(progressCycles.id, cycleId),
    });

    if (!cycle || cycle.klienId !== profile.id) {
      throw new AppError(404, "Siklus tidak ditemukan");
    }

    const mulai = cycle.tanggalMulai;
    const akhir = cycle.status === "selesai" && cycle.tanggalSelesai 
      ? cycle.tanggalSelesai 
      : new Date().toISOString().slice(0, 10);

    const activitySums = await db.select({
      tanggal: activityLogs.tanggal,
      total: sql<string>`SUM(${activityLogs.kaloriTerbakar})`,
    })
    .from(activityLogs)
    .where(and(
      eq(activityLogs.klienId, profile.id),
      gte(activityLogs.tanggal, mulai),
      lte(activityLogs.tanggal, akhir)
    ))
    .groupBy(activityLogs.tanggal);

    const mealSums = await db.select({
      tanggal: mealLogs.tanggal,
      total: sql<string>`SUM(${mealLogs.kaloriMasuk})`,
    })
    .from(mealLogs)
    .where(and(
      eq(mealLogs.klienId, profile.id),
      gte(mealLogs.tanggal, mulai),
      lte(mealLogs.tanggal, akhir)
    ))
    .groupBy(mealLogs.tanggal);

    const logMap = new Map<string, { kaloriMasuk: number, kaloriKeluar: number }>();

    for (const item of activitySums) {
      logMap.set(item.tanggal, {
        kaloriMasuk: 0,
        kaloriKeluar: Number(item.total) || 0
      });
    }

    for (const item of mealSums) {
      const existing = logMap.get(item.tanggal);
      if (existing) {
        existing.kaloriMasuk = Number(item.total) || 0;
      } else {
        logMap.set(item.tanggal, {
          kaloriMasuk: Number(item.total) || 0,
          kaloriKeluar: 0
        });
      }
    }

    const logs = Array.from(logMap.entries()).map(([tanggal, data]) => ({
      tanggal,
      kaloriMasuk: data.kaloriMasuk,
      kaloriKeluar: data.kaloriKeluar,
    }));

    logs.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    return logs;
  },

  async getFeedbacks(userId: number) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    const result = await db.query.feedbacks.findMany({
      where: eq(feedbacks.klienId, profile.id),
      with: {
        pt: true,
      },
      orderBy: desc(feedbacks.createdAt),
    });

    return {
      data: result.map((f) => ({
        id: f.id,
        source: f.source,
        pesan: f.pesan,
        balasanKlien: f.balasanKlien,
        dibaca: f.dibaca,
        createdAt: f.createdAt,
        pt: f.source === "ai" ? null : (f.pt ? {
          id: f.pt.id,
          nama: f.pt.nama,
        } : null),
      })),
      meta: { total: result.length }
    };
  },

  async replyFeedback(userId: number, feedbackId: number, balasan: string) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    const feedback = await db.query.feedbacks.findFirst({
      where: and(
        eq(feedbacks.id, feedbackId),
        eq(feedbacks.klienId, profile.id)
      ),
      with: { pt: true },
    });

    if (!feedback) {
      throw new AppError(404, "Feedback tidak ditemukan");
    }

    if (feedback.source === "ai") {
      throw new AppError(400, "Feedback dari AI tidak dapat dibalas");
    }

    if (feedback.balasanKlien !== null) {
      throw new AppError(400, "Feedback sudah dibalas");
    }

    await db.update(feedbacks)
      .set({ balasanKlien: balasan })
      .where(eq(feedbacks.id, feedback.id));

    const updated = await db.query.feedbacks.findFirst({
      where: eq(feedbacks.id, feedback.id),
      with: { pt: true },
    });

    return {
      data: {
        id: updated!.id,
        source: updated!.source,
        pesan: updated!.pesan,
        balasanKlien: updated!.balasanKlien,
        dibaca: updated!.dibaca,
        createdAt: updated!.createdAt,
        pt: updated!.source === "ai" ? null : (updated!.pt ? {
          id: updated!.pt.id,
          nama: updated!.pt.nama,
        } : null),
      }
    };
  },

  async readFeedback(userId: number, feedbackId: number) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    const feedback = await db.query.feedbacks.findFirst({
      where: and(
        eq(feedbacks.id, feedbackId),
        eq(feedbacks.klienId, profile.id)
      ),
      with: { pt: true },
    });

    if (!feedback) {
      throw new AppError(404, "Feedback tidak ditemukan");
    }

    await db.update(feedbacks)
      .set({ dibaca: true })
      .where(eq(feedbacks.id, feedback.id));

    const updated = await db.query.feedbacks.findFirst({
      where: eq(feedbacks.id, feedback.id),
      with: { pt: true },
    });

    return {
      data: {
        id: updated!.id,
        source: updated!.source,
        pesan: updated!.pesan,
        balasanKlien: updated!.balasanKlien,
        dibaca: updated!.dibaca,
        createdAt: updated!.createdAt,
        pt: updated!.source === "ai" ? null : (updated!.pt ? {
          id: updated!.pt.id,
          nama: updated!.pt.nama,
        } : null),
      }
    };
  }
};
