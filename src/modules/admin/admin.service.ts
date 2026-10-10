import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import { users, adminProfiles } from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import * as argon2 from "argon2";
import type {
  UpdateAdminProfileInput,
  ChangeAdminPasswordInput,
  ChangeAdminThemeInput,
} from "./admin.schema";

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
};
