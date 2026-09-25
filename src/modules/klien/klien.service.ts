import { eq, desc, and } from "drizzle-orm";
import { db } from "../../config/db";
import { klienProfiles, progressCycles, weightLogs, users, ptProfiles, weeklyPlans } from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import * as argon2 from "argon2";
import { calculateTargetKalori } from "../../utils/kalori";
import { generateWeeklyPlan } from "../ai/weekly-plan";
import type { 
  UpdateProfileInput, 
  ChangePasswordInput, 
  ChangeThemeInput, 
  WeightLogInput, 
  NewCycleInput 
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
};
