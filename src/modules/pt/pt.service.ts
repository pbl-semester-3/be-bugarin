import { eq, desc, and, isNotNull, ne } from "drizzle-orm";
import { db } from "../../config/db";
import { users, klienProfiles, ptProfiles, pairingRequests, progressCycles, weeklyPlans } from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import { getStartOfWeekUtc } from "../../utils/week";
import { generateWeeklyPlan } from "../ai/weekly-plan";
import * as argon2 from "argon2";
import type { UpdatePtProfileInput, ChangePtPasswordInput, ChangePtThemeInput } from "./pt.schema";

// Ownership convention: resolve pt_profiles dari users.id (req.user.id). JANGAN bandingkan
// users.id langsung ke kolom pt_id — keduanya tidak dijamin sama.
async function buildPtProfile(ptUserId: number) {
  const profile = await db.query.ptProfiles.findFirst({
    where: eq(ptProfiles.userId, ptUserId),
    with: { user: true },
  });
  if (!profile) throw new AppError(404, "Profil PT tidak ditemukan");

  return {
    user: {
      id: profile.user.id,
      email: profile.user.email,
      username: profile.user.username,
      tema: profile.user.tema,
    },
    profile: {
      nama: profile.nama,
      usia: profile.usia,
      jenisKelamin: profile.jenisKelamin,
      spesialisasi: profile.spesialisasi,
      tempatGym: profile.tempatGym,
    },
  };
}

export const ptService = {
  async getProfile(ptUserId: number) {
    return buildPtProfile(ptUserId);
  },

  async updateProfile(ptUserId: number, data: UpdatePtProfileInput) {
    const profile = await db.query.ptProfiles.findFirst({
      where: eq(ptProfiles.userId, ptUserId),
    });
    if (!profile) throw new AppError(404, "Profil PT tidak ditemukan");

    const setData: Partial<typeof ptProfiles.$inferInsert> = {};
    if (data.nama !== undefined) setData.nama = data.nama;
    if (data.usia !== undefined) setData.usia = data.usia;
    if (data.jenisKelamin !== undefined) setData.jenisKelamin = data.jenisKelamin;
    if (data.spesialisasi !== undefined) setData.spesialisasi = data.spesialisasi;
    if (data.tempatGym !== undefined) setData.tempatGym = data.tempatGym;

    if (Object.keys(setData).length > 0) {
      await db.update(ptProfiles).set(setData).where(eq(ptProfiles.id, profile.id));
    }

    return buildPtProfile(ptUserId);
  },

  async changePassword(ptUserId: number, data: ChangePtPasswordInput) {
    const user = await db.query.users.findFirst({ where: eq(users.id, ptUserId) });
    if (!user) throw new AppError(404, "User tidak ditemukan");

    const isMatch = await argon2.verify(user.passwordHash, data.passwordSaatIni);
    if (!isMatch) throw new AppError(400, "Password saat ini salah");

    const newHash = await argon2.hash(data.passwordBaru);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, ptUserId));

    return { message: "Password berhasil diubah" };
  },

  async changeTheme(ptUserId: number, data: ChangePtThemeInput) {
    await db.update(users).set({ tema: data.tema }).where(eq(users.id, ptUserId));
    return { tema: data.tema };
  },

  async getPtRecommendations(klienUserId: number) {
    const klienProfile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, klienUserId),
    });

    if (!klienProfile) {
      throw new AppError(404, "Profil klien tidak ditemukan");
    }

    const activeCycle = await db.query.progressCycles.findFirst({
      where: and(
        eq(progressCycles.klienId, klienProfile.id),
        eq(progressCycles.status, "aktif")
      ),
    });

    if (!activeCycle) {
      throw new AppError(422, "Lengkapi profil dan buat siklus target terlebih dahulu");
    }

    const tujuan = activeCycle.tujuan;

    // TODO: setelah feat/crud-user-admin selesai (kolom is_active ditambahkan ke tabel users),
    // tambahkan filter AND users.is_active = true di sini untuk exclude PT yang di-soft-delete

    let ptFilters = and(
      eq(ptProfiles.spesialisasi, tujuan),
      isNotNull(ptProfiles.tempatGym)
    );

    if (klienProfile.ptId !== null) {
      ptFilters = and(
        ptFilters,
        ne(ptProfiles.id, klienProfile.ptId)
      );
    }

    const recommendedPts = await db.query.ptProfiles.findMany({
      where: ptFilters,
      with: {
        user: true
      }
    });

    return recommendedPts.map(pt => ({
      id: pt.id,
      nama: pt.nama,
      spesialisasi: pt.spesialisasi,
      tempatGym: pt.tempatGym!,
    }));
  },

  async getPairingRequests(ptUserId: number) {
    const ptProfile = await db.query.ptProfiles.findFirst({
      where: eq(ptProfiles.userId, ptUserId),
    });

    if (!ptProfile) {
      throw new AppError(404, "Profil PT tidak ditemukan");
    }

    const requests = await db.query.pairingRequests.findMany({
      where: and(
        eq(pairingRequests.ptId, ptProfile.id),
        eq(pairingRequests.status, "pending")
      ),
      with: {
        klien: {
          with: {
            progressCycles: {
              where: eq(progressCycles.status, "aktif"),
              limit: 1,
            }
          }
        }
      },
      orderBy: [desc(pairingRequests.createdAt)],
    });

    return requests.map((req: any) => ({
      id: req.id,
      createdAt: req.createdAt,
      klien: {
        id: req.klien.id,
        nama: req.klien.nama,
        tujuan: req.klien.progressCycles.length > 0 ? req.klien.progressCycles[0].tujuan : null,
      }
    }));
  },

  async respondPairingRequest(ptUserId: number, requestId: number, alasanPenolakan?: string) {
    const ptProfile = await db.query.ptProfiles.findFirst({
      where: eq(ptProfiles.userId, ptUserId),
    });

    if (!ptProfile) {
      throw new AppError(404, "Profil PT tidak ditemukan");
    }

    const request = await db.query.pairingRequests.findFirst({
      where: eq(pairingRequests.id, requestId),
    });

    if (!request) {
      throw new AppError(404, "Pairing request tidak ditemukan");
    }

    if (request.ptId !== ptProfile.id) {
      throw new AppError(404, "Data tidak ditemukan");
    }

    if (request.status !== "pending") {
      throw new AppError(409, "Request ini sudah direspons.");
    }

    if (alasanPenolakan !== undefined && alasanPenolakan.trim() !== "") {
      // Tolak
      await db.update(pairingRequests)
        .set({ status: "ditolak", alasanPenolakan })
        .where(eq(pairingRequests.id, requestId));
        
      return { id: requestId, status: "ditolak", alasanPenolakan };
    } else {
      // Terima
      await db.transaction(async (tx) => {
        await tx.update(pairingRequests)
          .set({ status: "diterima" })
          .where(eq(pairingRequests.id, requestId));
          
        await tx.update(klienProfiles)
          .set({ ptId: ptProfile.id })
          .where(eq(klienProfiles.id, request.klienId));
      });

      // Fire and forget AI and save to DB
      (async () => {
        try {
          const klienProf = await db.query.klienProfiles.findFirst({
            where: eq(klienProfiles.id, request.klienId),
          });
          const cycle = await db.query.progressCycles.findFirst({
            where: and(
              eq(progressCycles.klienId, request.klienId),
              eq(progressCycles.status, "aktif")
            ),
          });
          if (klienProf && cycle && ptProfile.tempatGym) {
            const planResult = await generateWeeklyPlan({
              tinggiBadanCm: klienProf.tinggiBadanCm ?? null,
              alergiMakanan: klienProf.alergiMakanan ?? null,
              bbAwalKg: cycle.bbAwalKg,
              bbSekarangKg: cycle.bbAwalKg, // we could fetch weightLogs, but let's just use bbAwalKg for first plan
              bbTujuanKg: cycle.bbTujuanKg,
              tujuan: cycle.tujuan,
              tempatGym: ptProfile.tempatGym,
            });
            
            const startOfWeek = getStartOfWeekUtc();

            const existingPlan = await db.query.weeklyPlans.findFirst({
              where: and(
                eq(weeklyPlans.klienId, request.klienId),
                eq(weeklyPlans.mingguMulai, startOfWeek),
              ),
            });
            if (existingPlan) return;

            await db.insert(weeklyPlans).values({
              klienId: request.klienId,
              mingguMulai: startOfWeek,
              workoutPlan: planResult.workoutPlan,
              mealPlan: planResult.mealPlan,
              status: "pending_review",
            });
          }
        } catch (err) {
          console.error("Failed to generate weekly plan for new pairing:", err);
        }
      })();

      return { id: requestId, status: "diterima" };
    }
  }
};
