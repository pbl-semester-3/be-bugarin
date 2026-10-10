import { eq, and, asc, sql, isNotNull } from "drizzle-orm";
import { db } from "../../config/db";
import {
  users,
  adminProfiles,
  klienProfiles,
  ptProfiles,
  progressCycles,
  pairingRequests,
  adminActivityLogs,
} from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import * as argon2 from "argon2";
import type {
  UpdateAdminProfileInput,
  ChangeAdminPasswordInput,
  ChangeAdminThemeInput,
  CreatePtInput,
  UpdateUserInput,
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
      klienProfile: null,
      ptProfile: p
        ? { nama: p.nama, usia: p.usia, jenisKelamin: p.jenisKelamin, spesialisasi: p.spesialisasi, tempatGym: p.tempatGym }
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
async function buildAdminProfile(userId: number) {
  const profile = await db.query.adminProfiles.findFirst({
    where: eq(adminProfiles.userId, userId),
    with: { user: true },
  });
  if (!profile) throw new AppError(404, "Profil Admin tidak ditemukan");

  return {
    user: {
      id: profile.user.id,
      email: profile.user.email,
      username: profile.user.username,
      tema: profile.user.tema,
    },
    profile: {
      nama: profile.nama,
    },
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

    try {
      await db.transaction(async (tx) => {
        if (Object.keys(userSet).length > 0) {
          await tx.update(users).set(userSet).where(eq(users.id, userId));
        }
        if (data.nama !== undefined) {
          await tx.update(adminProfiles)
            .set({ nama: data.nama })
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
          progressCycles: { where: eq(progressCycles.status, "aktif"), limit: 1 },
        },
        orderBy: [asc(klienProfiles.id)],
      });
      return {
        data: rows.map((k) => ({
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
            tujuan: k.progressCycles.length > 0 ? k.progressCycles[0].tujuan : null,
          },
          ptProfile: null,
        })),
      };
    }

    const rows = await db.query.ptProfiles.findMany({
      with: { user: true },
      orderBy: [asc(ptProfiles.id)],
    });
    return {
      data: rows.map((p) => ({
        id: p.user.id,
        email: p.user.email,
        username: p.user.username,
        role: p.user.role,
        isActive: p.user.isActive,
        klienProfile: null,
        ptProfile: {
          nama: p.nama,
          usia: p.usia,
          jenisKelamin: p.jenisKelamin,
          spesialisasi: p.spesialisasi,
          tempatGym: p.tempatGym,
        },
      })),
    };
  },

  async createPt(adminId: number, data: CreatePtInput) {
    const passwordHash = await argon2.hash(data.password);
    try {
      const userId = await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(users).values({
          email: data.email,
          username: data.username,
          passwordHash,
          role: "pt",
          isActive: true,
        });
        const newUserId = inserted.insertId;
        await tx.insert(ptProfiles).values({ userId: newUserId, nama: data.nama });
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
        username: data.username,
        role: "pt" as const,
        ptProfile: { nama: data.nama },
      };
    } catch (error) {
      throw asDuplicateError(error);
    }
  },

  async updateUser(adminId: number, targetId: number, data: UpdateUserInput) {
    const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
    if (!target || target.role === "admin") {
      throw new AppError(404, "User tidak ditemukan");
    }

    const userSet: Partial<typeof users.$inferInsert> = {};
    if (data.email !== undefined) userSet.email = data.email;
    if (data.username !== undefined) userSet.username = data.username;
    if (data.password !== undefined) userSet.passwordHash = await argon2.hash(data.password);

    try {
      await db.transaction(async (tx) => {
        if (Object.keys(userSet).length > 0) {
          await tx.update(users).set(userSet).where(eq(users.id, targetId));
        }
        if (data.nama !== undefined) {
          if (target.role === "pt") {
            await tx.update(ptProfiles).set({ nama: data.nama }).where(eq(ptProfiles.userId, targetId));
          } else {
            await tx.update(klienProfiles).set({ nama: data.nama }).where(eq(klienProfiles.userId, targetId));
          }
        }
        await tx.insert(adminActivityLogs).values({
          adminId,
          aksi: `Admin mengubah user: ${data.nama ?? target.email}`,
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
    if (!target || target.role === "admin") {
      throw new AppError(404, "User tidak ditemukan");
    }

    let nama = target.email;
    await db.transaction(async (tx) => {
      await tx.update(users).set({ isActive: false }).where(eq(users.id, targetId));

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
        aksi: `Admin menonaktifkan user: ${nama}`,
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

    return {
      totalKlien: Number(klienRows[0]?.total ?? 0),
      totalPt: Number(ptRows[0]?.total ?? 0),
      totalPairingAktif: Number(pairingRows[0]?.total ?? 0),
      totalRequestPending: Number(pendingRows[0]?.total ?? 0),
    };
  },
};
