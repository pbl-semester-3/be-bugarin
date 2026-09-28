import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import { db } from "../../config/db";
import { klienProfiles, progressCycles, weightLogs, users, weeklyPlans, activityLogs, masterOlahraga, mealLogs, masterMakanan, ptProfiles, pairingRequests } from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import * as argon2 from "argon2";
import { calculateTargetKalori } from "../../utils/kalori";
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

    const isProfileComplete = Boolean(
      profile.usia && 
      profile.jenisKelamin && 
      profile.tinggiBadanCm && 
      activeCycle
    );

    return {
      ...profile,
      profileComplete: isProfileComplete,
      activeCycle,
    };
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
        // Cari id klien dari user
        const date = new Date();
        const startOfWeek = new Date(date.setDate(date.getDate() - date.getDay() + 1)).toISOString().slice(0, 10);
        
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

    let resolvedMakananId: number;
    let resolvedNamaMakanan: string;
    let kaloriPer100g: number;

    if (data.makananId) {
      const makanan = await db.query.masterMakanan.findFirst({
        where: eq(masterMakanan.id, data.makananId)
      });
      if (!makanan) throw new AppError(404, "Makanan tidak ditemukan");
      resolvedMakananId = makanan.id;
      resolvedNamaMakanan = makanan.nama;
      kaloriPer100g = makanan.kaloriPer100g;
    } else if (data.namaMakanan) {
      const searchNama = data.namaMakanan;
      const makanan = await db.query.masterMakanan.findFirst({
        where: sql`LOWER(${masterMakanan.nama}) = LOWER(${searchNama})`
      });

      if (makanan) {
        resolvedMakananId = makanan.id;
        resolvedNamaMakanan = makanan.nama;
        kaloriPer100g = makanan.kaloriPer100g;
      } else {
        const estimated = await estimateFoodCalories(searchNama);
        try {
          const [insertMakanan] = await db.insert(masterMakanan).values({
            nama: searchNama,
            kaloriPer100g: estimated.kaloriPer100g,
            kategori: estimated.kategori,
            sumber: "ai_generated",
          });
          resolvedMakananId = insertMakanan.insertId;
          resolvedNamaMakanan = searchNama;
          kaloriPer100g = estimated.kaloriPer100g;
        } catch (error) {
          const err = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
          const code = err.code || err.cause?.code;
          const errno = err.errno || err.cause?.errno;
          if (code === 'ER_DUP_ENTRY' || errno === 1062) {
            const existing = await db.query.masterMakanan.findFirst({
              where: sql`LOWER(${masterMakanan.nama}) = LOWER(${searchNama})`
            });
            if (!existing) throw new AppError(500, "Terjadi kesalahan saat memproses makanan unik");
            resolvedMakananId = existing.id;
            resolvedNamaMakanan = existing.nama;
            kaloriPer100g = existing.kaloriPer100g;
          } else {
            throw error;
          }
        }
      }
    } else {
      throw new AppError(400, "Harus mengirim makananId atau namaMakanan");
    }

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

  async getCurrentWeeklyPlan(userId: number) {
    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil tidak ditemukan");

    // Mencari tanggal hari Senin minggu ini
    const date = new Date();
    const day = date.getDay() || 7;
    if (day !== 1) date.setHours(-24 * (day - 1));
    const startOfWeek = date.toISOString().slice(0, 10);

    const plan = await db.query.weeklyPlans.findFirst({
      where: and(
        eq(weeklyPlans.klienId, profile.id),
        eq(weeklyPlans.mingguMulai, startOfWeek),
        sql`${weeklyPlans.status} IN ('disetujui', 'override')`
      ),
      orderBy: [desc(weeklyPlans.generatedAt)],
    });

    if (!plan) return null;

    return {
      id: plan.id,
      mingguMulai: plan.mingguMulai,
      status: plan.status,
      workoutPlan: plan.workoutPlan,
      mealPlan: plan.mealPlan,
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
  }
};
