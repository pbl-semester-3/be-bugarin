import { eq, and, asc, desc, sql, isNotNull, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { db } from "../../config/db";
import {
  users,
  adminProfiles,
  klienProfiles,
  ptProfiles,
  progressCycles,
  weightLogs,
  pairingRequests,
  adminActivityLogs,
  feedbacks,
} from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import { buildCloudinaryUrl } from "../../config/cloudinary";
import { generateUniqueUsername } from "../../utils/username";
import * as argon2 from "argon2";
import type {
  UpdateAdminProfileInput,
  ChangeAdminPasswordInput,
  ChangeAdminThemeInput,
  CreatePtInput,
  UpdateUserInput,
  GetRiwayatQueryInput,
} from "./admin.schema";

function asDuplicateError(error: unknown): unknown {
  const err = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  const code = err.code || err.cause?.code;
  const errno = err.errno || err.cause?.errno;
  if (code === "ER_DUP_ENTRY" || errno === 1062) {
    return new AppError(409, "Email/username sudah digunakan");
  }
  return error;
}

// ID tampilan PT (bukan kredensial login), stabil dari users.id.
function formatTrainerId(userId: number) {
  return `PT-BGR-${String(userId).padStart(4, "0")}`;
}

// Formula sama dengan progress bar profil klien mobile:
// bbAwal -> bbSekarang (fallback bbAwal) -> bbTujuan, clamp 0..100%.
function calculateWeightProgress(
  cycle: { bbAwalKg: number; bbTujuanKg: number } | null | undefined,
  latestKg: number | undefined,
) {
  if (!cycle) return 0;
  const sekarang = latestKg ?? cycle.bbAwalKg;
  const jarak = cycle.bbTujuanKg - cycle.bbAwalKg;
  if (jarak === 0) return 0;
  const rasio = Math.min(1, Math.max(0, (sekarang - cycle.bbAwalKg) / jarak));
  return Math.round(rasio * 100);
}

// Item user untuk response CRUD (bentuk sama dengan list).
async function buildUserItem(userId: number) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw new AppError(404, "User tidak ditemukan");

  if (u.role === "pt") {
    const p = await db.query.ptProfiles.findFirst({ where: eq(ptProfiles.userId, userId) });
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      trainerId: formatTrainerId(u.id),
      klienProfile: null,
      ptProfile: p
        ? { nama: p.nama, usia: p.usia, jenisKelamin: p.jenisKelamin, spesialisasi: p.spesialisasi, tempatGym: p.tempatGym, whatsapp: p.whatsapp, fotoUrl: buildCloudinaryUrl(p.fotoPublicId) }
        : null,
    };
  }

  const k = await db.query.klienProfiles.findFirst({
    where: eq(klienProfiles.userId, userId),
    with: { progressCycles: { where: eq(progressCycles.status, "aktif"), limit: 1 } },
  });
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    role: u.role,
    isActive: u.isActive,
    klienProfile: k
      ? {
          nama: k.nama,
          usia: k.usia,
          jenisKelamin: k.jenisKelamin,
          tinggiBadanCm: k.tinggiBadanCm,
          alergiMakanan: k.alergiMakanan,
          ptId: k.ptId,
          tujuan: k.progressCycles.length > 0 ? k.progressCycles[0].tujuan : null,
        }
      : null,
    ptProfile: null,
  };
}

// Identitas admin: resolve admin_profiles dari users.id (req.user.id).
function splitNama(nama: string) {
  const parts = nama.trim().split(/\s+/);
  return {
    depan: parts[0] ?? "",
    belakang: parts.slice(1).join(" "),
  };
}

async function buildAdminProfile(userId: number) {
  const profile = await db.query.adminProfiles.findFirst({
    where: eq(adminProfiles.userId, userId),
    with: { user: true },
  });
  if (!profile) throw new AppError(404, "Profil Admin tidak ditemukan");

  const fallback = splitNama(profile.nama);
  const namaDepan = profile.namaDepan ?? fallback.depan;
  const namaBelakang = profile.namaBelakang ?? fallback.belakang;

  return {
    user: {
      id: profile.user.id,
      email: profile.user.email,
      username: profile.user.username,
      tema: profile.user.tema,
    },
    profile: {
      nama: profile.nama,
      namaDepan,
      namaBelakang,
      phone: profile.phone ?? "",
      bio: profile.bio ?? "",
      fotoUrl: null,
    },
    updatedAt: profile.user.updatedAt,
  };
}

export const adminService = {
  async getProfile(userId: number) {
    return buildAdminProfile(userId);
  },

  async updateProfile(userId: number, data: UpdateAdminProfileInput) {
    const profile = await db.query.adminProfiles.findFirst({
      where: eq(adminProfiles.userId, userId),
    });
    if (!profile) throw new AppError(404, "Profil Admin tidak ditemukan");

    const userSet: Partial<typeof users.$inferInsert> = {};
    if (data.email !== undefined) userSet.email = data.email;
    if (data.username !== undefined) userSet.username = data.username;

    const profileSet: Partial<typeof adminProfiles.$inferInsert> = {};
    if (data.namaDepan !== undefined || data.namaBelakang !== undefined) {
      const fallback = splitNama(profile.nama);
      const depan = data.namaDepan ?? profile.namaDepan ?? fallback.depan;
      const belakang =
        data.namaBelakang ?? profile.namaBelakang ?? fallback.belakang;
      profileSet.namaDepan = depan;
      profileSet.namaBelakang = belakang;
      profileSet.nama = `${depan} ${belakang}`.trim();
    } else if (data.nama !== undefined) {
      const split = splitNama(data.nama);
      profileSet.nama = data.nama;
      profileSet.namaDepan = split.depan;
      profileSet.namaBelakang = split.belakang;
    }
    if (data.phone !== undefined) profileSet.phone = data.phone;
    if (data.bio !== undefined) profileSet.bio = data.bio;

    try {
      await db.transaction(async (tx) => {
        if (Object.keys(userSet).length > 0) {
          await tx.update(users).set(userSet).where(eq(users.id, userId));
        }
        if (Object.keys(profileSet).length > 0) {
          await tx
            .update(adminProfiles)
            .set(profileSet)
            .where(eq(adminProfiles.id, profile.id));
        }
      });
    } catch (error) {
      const err = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
      const code = err.code || err.cause?.code;
      const errno = err.errno || err.cause?.errno;
      if (code === "ER_DUP_ENTRY" || errno === 1062) {
        throw new AppError(409, "Email/username sudah digunakan");
      }
      throw error;
    }

    return buildAdminProfile(userId);
  },

  async changePassword(userId: number, data: ChangeAdminPasswordInput) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new AppError(404, "User tidak ditemukan");

    const isMatch = await argon2.verify(user.passwordHash, data.passwordSaatIni);
    if (!isMatch) throw new AppError(400, "Password saat ini tidak cocok");

    const newHash = await argon2.hash(data.passwordBaru);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

    return { message: "Password berhasil diubah" };
  },

  async changeTheme(userId: number, data: ChangeAdminThemeInput) {
    await db.update(users).set({ tema: data.tema }).where(eq(users.id, userId));
    return { tema: data.tema };
  },

  async listUsers(role: "klien" | "pt") {
    if (role === "klien") {
      const rows = await db.query.klienProfiles.findMany({
        with: {
          user: true,
          pt: true,
          progressCycles: {
            where: eq(progressCycles.status, "aktif"),
            orderBy: [desc(progressCycles.tanggalMulai)],
            limit: 1,
          },
        },
        orderBy: [asc(klienProfiles.id)],
      });

      // Klien nonaktif/terhapus tidak ditampilkan di daftar admin.
      const activeRows = rows.filter(
        (k) => k.user.deletedAt == null && k.user.isActive,
      );

      const profileIds = activeRows.map((k) => k.id);
      const latestWeightByKlien = new Map<number, number>();
      if (profileIds.length > 0) {
        const weightRows = await db
          .select({
            klienId: weightLogs.klienId,
            beratBadanKg: weightLogs.beratBadanKg,
          })
          .from(weightLogs)
          .where(inArray(weightLogs.klienId, profileIds))
          .orderBy(desc(weightLogs.tanggal), desc(weightLogs.id));
        for (const row of weightRows) {
          if (!latestWeightByKlien.has(row.klienId)) {
            latestWeightByKlien.set(row.klienId, row.beratBadanKg);
          }
        }
      }

      return {
        data: activeRows.map((k) => {
          const cycle = k.progressCycles[0] ?? null;
          return {
            id: k.user.id,
            email: k.user.email,
            username: k.user.username,
            role: k.user.role,
            isActive: k.user.isActive,
            klienProfile: {
              nama: k.nama,
              usia: k.usia,
              jenisKelamin: k.jenisKelamin,
              tinggiBadanCm: k.tinggiBadanCm,
              alergiMakanan: k.alergiMakanan,
              ptId: k.ptId,
              ptNama: k.pt?.nama ?? null,
              tujuan: cycle?.tujuan ?? null,
              progress: calculateWeightProgress(
                cycle,
                latestWeightByKlien.get(k.id),
              ),
              fotoUrl: buildCloudinaryUrl(k.fotoPublicId),
            },
            ptProfile: null,
          };
        }),
      };
    }

    const rows = await db.query.ptProfiles.findMany({
      with: { user: true },
      orderBy: [asc(ptProfiles.id)],
    });
    return {
      data: rows
        .filter((p) => p.user.deletedAt == null)
        .map((p) => ({
          id: p.user.id,
          email: p.user.email,
          username: p.user.username,
          role: p.user.role,
          isActive: p.user.isActive,
          createdAt: p.user.createdAt,
          trainerId: formatTrainerId(p.user.id),
          klienProfile: null,
          ptProfile: {
            nama: p.nama,
            usia: p.usia,
            jenisKelamin: p.jenisKelamin,
            spesialisasi: p.spesialisasi,
            tempatGym: p.tempatGym,
            whatsapp: p.whatsapp,
            fotoUrl: buildCloudinaryUrl(p.fotoPublicId),
          },
        })),
    };
  },

  async getKlienDetailForAdmin(targetId: number) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, targetId),
    });
    if (!user || user.role !== "klien" || user.deletedAt) {
      throw new AppError(404, "Klien tidak ditemukan");
    }

    const profile = await db.query.klienProfiles.findFirst({
      where: eq(klienProfiles.userId, targetId),
      with: {
        pt: true,
        progressCycles: {
          where: eq(progressCycles.status, "aktif"),
          orderBy: [desc(progressCycles.tanggalMulai)],
          limit: 1,
        },
      },
    });
    if (!profile) throw new AppError(404, "Klien tidak ditemukan");

    const cycle = profile.progressCycles[0] ?? null;
    const logs = await db.query.weightLogs.findMany({
      where: eq(weightLogs.klienId, profile.id),
      orderBy: [desc(weightLogs.tanggal), desc(weightLogs.id)],
    });
    const latestWeight = logs[0]?.beratBadanKg;

    return {
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        isActive: user.isActive,
        klienProfile: {
          nama: profile.nama,
          usia: profile.usia,
          jenisKelamin: profile.jenisKelamin,
          tinggiBadanCm: profile.tinggiBadanCm,
          alergiMakanan: profile.alergiMakanan,
          ptId: profile.ptId,
          ptNama: profile.pt?.nama ?? null,
          fotoUrl: buildCloudinaryUrl(profile.fotoPublicId),
          tujuan: cycle?.tujuan ?? null,
          progress: calculateWeightProgress(cycle, latestWeight),
        },
        activeCycle: cycle
          ? {
              id: cycle.id,
              bbAwalKg: cycle.bbAwalKg,
              bbTujuanKg: cycle.bbTujuanKg,
              tujuan: cycle.tujuan,
              durasiHari: cycle.durasiHari,
              targetKaloriPerHari: cycle.targetKaloriPerHari,
              streak: cycle.streak,
              status: cycle.status,
              tanggalMulai: cycle.tanggalMulai,
            }
          : null,
        bbSekarangKg: latestWeight ?? null,
        weightLogs: logs.map((log) => ({
          id: log.id,
          beratBadanKg: log.beratBadanKg,
          tanggal: log.tanggal,
        })),
      },
    };
  },

  async createPt(adminId: number, data: CreatePtInput) {
    const passwordHash = await argon2.hash(data.password);
    const username = await generateUniqueUsername(data.email);
    try {
      const userId = await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(users).values({
          email: data.email,
          username,
          passwordHash,
          role: "pt",
          isActive: true,
        });
        const newUserId = inserted.insertId;
        await tx.insert(ptProfiles).values({
          userId: newUserId,
          nama: data.nama,
          usia: data.usia ?? null,
          jenisKelamin: data.jenisKelamin ?? null,
          whatsapp: data.whatsapp ?? null,
          tempatGym: data.tempatGym ?? null,
          spesialisasi: data.spesialisasi ?? null,
        });
        await tx.insert(adminActivityLogs).values({
          adminId,
          aksi: `Admin membuat akun PT: ${data.nama}`,
          targetUserId: newUserId,
        });
        return newUserId;
      });

      return {
        id: userId,
        email: data.email,
        username,
        role: "pt" as const,
        ptProfile: {
          nama: data.nama,
          usia: data.usia ?? null,
          jenisKelamin: data.jenisKelamin ?? null,
          whatsapp: data.whatsapp ?? null,
          tempatGym: data.tempatGym ?? null,
          spesialisasi: data.spesialisasi ?? null,
        },
      };
    } catch (error) {
      throw asDuplicateError(error);
    }
  },

  async updateUser(adminId: number, targetId: number, data: UpdateUserInput) {
    const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
    if (!target || target.role === "admin" || target.deletedAt) {
      throw new AppError(404, "User tidak ditemukan");
    }

    const userSet: Partial<typeof users.$inferInsert> = {};
    if (data.email !== undefined) userSet.email = data.email;
    if (data.username !== undefined) {
      // Username PT adalah identitas permanen (auto-generate saat dibuat).
      if (target.role === "pt") {
        throw new AppError(400, "Username PT tidak dapat diubah");
      }
      userSet.username = data.username;
    }
    if (data.password !== undefined) userSet.passwordHash = await argon2.hash(data.password);
    // Suspend/aktifkan kembali — hanya untuk PT.
    if (data.isActive !== undefined && target.role === "pt") {
      userSet.isActive = data.isActive;
    }

    // Field profil khusus PT (diabaikan bila target klien).
    const profileSet: Partial<typeof ptProfiles.$inferInsert> = {};
    if (data.nama !== undefined) profileSet.nama = data.nama;
    if (data.usia !== undefined) profileSet.usia = data.usia;
    if (data.jenisKelamin !== undefined) profileSet.jenisKelamin = data.jenisKelamin;
    if (data.whatsapp !== undefined) profileSet.whatsapp = data.whatsapp;
    if (data.tempatGym !== undefined) profileSet.tempatGym = data.tempatGym;
    if (data.spesialisasi !== undefined) profileSet.spesialisasi = data.spesialisasi;

    try {
      await db.transaction(async (tx) => {
        if (Object.keys(userSet).length > 0) {
          await tx.update(users).set(userSet).where(eq(users.id, targetId));
        }
        if (target.role === "pt") {
          if (Object.keys(profileSet).length > 0) {
            await tx.update(ptProfiles).set(profileSet).where(eq(ptProfiles.userId, targetId));
          }
        } else if (data.nama !== undefined) {
          await tx.update(klienProfiles).set({ nama: data.nama }).where(eq(klienProfiles.userId, targetId));
        }
        await tx.insert(adminActivityLogs).values({
          adminId,
          aksi:
            data.isActive !== undefined && target.role === "pt"
              ? `Admin ${data.isActive ? "mengaktifkan" : "menonaktifkan"} user: ${data.nama ?? target.email}`
              : `Admin mengubah user: ${data.nama ?? target.email}`,
          targetUserId: targetId,
        });
      });
    } catch (error) {
      throw asDuplicateError(error);
    }

    return buildUserItem(targetId);
  },

  async deleteUser(adminId: number, targetId: number) {
    const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
    if (!target || target.role === "admin" || target.deletedAt) {
      throw new AppError(404, "User tidak ditemukan");
    }

    let nama = target.email;
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ isActive: false, deletedAt: new Date() })
        .where(eq(users.id, targetId));

      if (target.role === "pt") {
        const [p] = await tx.select().from(ptProfiles).where(eq(ptProfiles.userId, targetId)).limit(1);
        if (p) {
          nama = p.nama;
          await tx.update(klienProfiles).set({ ptId: null }).where(eq(klienProfiles.ptId, p.id));
          await tx.delete(pairingRequests).where(
            and(eq(pairingRequests.ptId, p.id), eq(pairingRequests.status, "pending")),
          );
        }
      } else {
        const [k] = await tx.select().from(klienProfiles).where(eq(klienProfiles.userId, targetId)).limit(1);
        if (k) {
          nama = k.nama;
          await tx.update(klienProfiles).set({ ptId: null }).where(eq(klienProfiles.id, k.id));
          await tx.delete(pairingRequests).where(
            and(eq(pairingRequests.klienId, k.id), eq(pairingRequests.status, "pending")),
          );
        }
      }

      await tx.insert(adminActivityLogs).values({
        adminId,
        aksi: `Admin menghapus user: ${nama}`,
        targetUserId: targetId,
      });
    });

    return { id: targetId, isActive: false };
  },

  async getDashboardSummary() {
    const [klienRows, ptRows, pairingRows, pendingRows] = await Promise.all([
      db
        .select({ total: sql<string>`COUNT(*)` })
        .from(klienProfiles)
        .innerJoin(users, eq(klienProfiles.userId, users.id))
        .where(eq(users.isActive, true)),
      db
        .select({ total: sql<string>`COUNT(*)` })
        .from(ptProfiles)
        .innerJoin(users, eq(ptProfiles.userId, users.id))
        .where(eq(users.isActive, true)),
      db
        .select({ total: sql<string>`COUNT(*)` })
        .from(klienProfiles)
        .innerJoin(users, eq(klienProfiles.userId, users.id))
        .where(and(eq(users.isActive, true), isNotNull(klienProfiles.ptId))),
      db
        .select({ total: sql<string>`COUNT(*)` })
        .from(pairingRequests)
        .where(eq(pairingRequests.status, "pending")),
    ]);

    // ===== Data chart dashboard: tahun berjalan, zona WIB (UTC+7) =====
    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const year = nowWib.getUTCFullYear();
    const currentMonth = nowWib.getUTCMonth() + 1;

    // Registrasi klien aktif per bulan (WIB) pada tahun berjalan.
    const regRows = await db
      .select({
        ym: sql<string>`DATE_FORMAT(DATE_ADD(${users.createdAt}, INTERVAL 7 HOUR), '%Y-%m')`,
        total: sql<string>`COUNT(*)`,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "klien"),
          eq(users.isActive, true),
          sql`YEAR(DATE_ADD(${users.createdAt}, INTERVAL 7 HOUR)) = ${year}`
        )
      )
      .groupBy(
        sql`DATE_FORMAT(DATE_ADD(${users.createdAt}, INTERVAL 7 HOUR), '%Y-%m')`
      );

    // Klien aktif yang registrasi tahun ini + profil kliennya.
    const klienUsers = await db
      .select({
        userId: users.id,
        profileId: klienProfiles.id,
        regYm: sql<string>`DATE_FORMAT(DATE_ADD(${users.createdAt}, INTERVAL 7 HOUR), '%Y-%m')`,
      })
      .from(users)
      .innerJoin(klienProfiles, eq(klienProfiles.userId, users.id))
      .where(
        and(
          eq(users.role, "klien"),
          eq(users.isActive, true),
          sql`YEAR(DATE_ADD(${users.createdAt}, INTERVAL 7 HOUR)) = ${year}`
        )
      );

    // Siklus pertama per klien (tanggalMulai paling awal; tie-break id terkecil).
    const profileIds = klienUsers.map((k) => k.profileId);
    const cycles = profileIds.length
      ? await db
          .select({
            klienId: progressCycles.klienId,
            tujuan: progressCycles.tujuan,
            tanggalMulai: progressCycles.tanggalMulai,
          })
          .from(progressCycles)
          .where(inArray(progressCycles.klienId, profileIds))
          .orderBy(asc(progressCycles.tanggalMulai), asc(progressCycles.id))
      : [];

    const firstCycleByKlien = new Map<
      number,
      { tujuan: string; tanggalMulai: string }
    >();
    for (const cycle of cycles) {
      if (!firstCycleByKlien.has(cycle.klienId)) {
        firstCycleByKlien.set(cycle.klienId, {
          tujuan: cycle.tujuan,
          tanggalMulai: cycle.tanggalMulai,
        });
      }
    }

    const registeredByYm = new Map<string, number>();
    for (const row of regRows) {
      registeredByYm.set(row.ym, Number(row.total ?? 0));
    }

    // Subset ketat: klien yang registrasi DAN memilih tujuan di bulan yang sama.
    const naikByYm = new Map<string, number>();
    const turunByYm = new Map<string, number>();
    for (const klien of klienUsers) {
      const first = firstCycleByKlien.get(klien.profileId);
      if (!first) continue;
      const cycleYm = first.tanggalMulai.slice(0, 7); // "YYYY-MM"
      if (cycleYm !== klien.regYm) continue;

      if (first.tujuan === "naik_bb") {
        naikByYm.set(klien.regYm, (naikByYm.get(klien.regYm) ?? 0) + 1);
      } else if (first.tujuan === "turun_bb") {
        turunByYm.set(klien.regYm, (turunByYm.get(klien.regYm) ?? 0) + 1);
      }
    }

    // Spesialisasi PT aktif (untuk donut).
    const specRows = await db
      .select({
        spesialisasi: ptProfiles.spesialisasi,
        total: sql<string>`COUNT(*)`,
      })
      .from(ptProfiles)
      .innerJoin(users, eq(ptProfiles.userId, users.id))
      .where(and(eq(users.isActive, true), isNotNull(ptProfiles.spesialisasi)))
      .groupBy(ptProfiles.spesialisasi);

    const specCount = new Map<string, number>();
    for (const row of specRows) {
      if (row.spesialisasi) {
        specCount.set(row.spesialisasi, Number(row.total ?? 0));
      }
    }

    const MONTH_LABELS = [
      "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
      "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
    ];

    // Januari s/d bulan berjalan (tahun ini), bulan kosong = 0.
    const activityTrend = Array.from({ length: currentMonth }, (_, i) => {
      const month = i + 1;
      const ym = `${year}-${String(month).padStart(2, "0")}`;
      return {
        month: ym,
        label: MONTH_LABELS[i],
        totalRegistered: registeredByYm.get(ym) ?? 0,
        totalNaikBb: naikByYm.get(ym) ?? 0,
        totalTurunBb: turunByYm.get(ym) ?? 0,
        active: month === currentMonth,
      };
    });

    const specialization = [
      {
        key: "turun_bb" as const,
        label: "Turun BB",
        count: specCount.get("turun_bb") ?? 0,
      },
      {
        key: "naik_bb" as const,
        label: "Naik BB",
        count: specCount.get("naik_bb") ?? 0,
      },
    ];

    return {
      totalKlien: Number(klienRows[0]?.total ?? 0),
      totalPt: Number(ptRows[0]?.total ?? 0),
      totalPairingAktif: Number(pairingRows[0]?.total ?? 0),
      totalRequestPending: Number(pendingRows[0]?.total ?? 0),
      activityTrend,
      specialization,
    };
  },

  async getRiwayat(query: GetRiwayatQueryInput) {
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const adminUser = alias(users, "admin_user");
    const targetUser = alias(users, "target_user");

    const [feedbackRows, adminLogRows, feedbackCountRows, adminLogCountRows] = await Promise.all([
      db
        .select({
          id: feedbacks.id,
          namaPt: ptProfiles.nama,
          namaKlien: klienProfiles.nama,
          pesan: feedbacks.pesan,
          createdAt: feedbacks.createdAt,
        })
        .from(feedbacks)
        .innerJoin(ptProfiles, eq(feedbacks.ptId, ptProfiles.id))
        .innerJoin(klienProfiles, eq(feedbacks.klienId, klienProfiles.id))
        .where(eq(feedbacks.source, "pt"))
        .orderBy(desc(feedbacks.createdAt))
        .limit(limit)
        .offset(offset),

      db
        .select({
          id: adminActivityLogs.id,
          namaAdmin: adminProfiles.nama,
          namaTargetUser: sql<string | null>`COALESCE(${klienProfiles.nama}, ${ptProfiles.nama})`,
          aksi: adminActivityLogs.aksi,
          createdAt: adminActivityLogs.createdAt,
        })
        .from(adminActivityLogs)
        .innerJoin(adminUser, eq(adminActivityLogs.adminId, adminUser.id))
        .innerJoin(adminProfiles, eq(adminProfiles.userId, adminUser.id))
        .leftJoin(targetUser, eq(adminActivityLogs.targetUserId, targetUser.id))
        .leftJoin(klienProfiles, eq(klienProfiles.userId, targetUser.id))
        .leftJoin(ptProfiles, eq(ptProfiles.userId, targetUser.id))
        .orderBy(desc(adminActivityLogs.createdAt))
        .limit(limit)
        .offset(offset),

      db.select({ total: sql<string>`COUNT(*)` }).from(feedbacks).where(eq(feedbacks.source, "pt")),
      db.select({ total: sql<string>`COUNT(*)` }).from(adminActivityLogs),
    ]);

    const feedbackTotal = Number(feedbackCountRows[0]?.total ?? 0);
    const adminLogTotal = Number(adminLogCountRows[0]?.total ?? 0);

    return {
      data: {
        feedbackLogs: feedbackRows.map((r) => ({
          id: r.id,
          namaPt: r.namaPt,
          namaKlien: r.namaKlien,
          pesan: r.pesan,
          createdAt: r.createdAt,
        })),
        adminActivityLogs: adminLogRows.map((r) => ({
          id: r.id,
          namaAdmin: r.namaAdmin,
          namaTargetUser: r.namaTargetUser ?? null,
          aksi: r.aksi,
          createdAt: r.createdAt,
        })),
      },
      meta: {
        feedbackLogs: { total: feedbackTotal, page, hasMore: page * limit < feedbackTotal },
        adminActivityLogs: { total: adminLogTotal, page, hasMore: page * limit < adminLogTotal },
      },
    };
  },
};
