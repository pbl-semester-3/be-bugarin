import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { eq, or } from "drizzle-orm";
import { db } from "../../config/db";
import { env } from "../../config/env";
import { users, klienProfiles } from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import type { RegisterInput, LoginInput } from "./auth.schema";

type Role = "klien" | "pt" | "admin";

export function issueToken(user: { id: number; role: Role }) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: "7d" });
}

export async function registerKlien(input: RegisterInput) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.email, input.email), eq(users.username, input.username)))
    .limit(1);

  if (existing.length > 0) {
    throw new AppError(409, "Email atau username sudah dipakai");
  }

  const passwordHash = await argon2.hash(input.password);

  return db.transaction(async (tx) => {
    const [insertedUser] = await tx.insert(users).values({
      email: input.email,
      username: input.username,
      passwordHash,
      role: "klien",
    });

    const userId = insertedUser.insertId;

    await tx.insert(klienProfiles).values({
      userId,
      nama: input.nama,
      // usia, jenisKelamin, tinggiBadanCm sengaja dibiarkan null — diisi saat Onboarding.
    });

    return { id: userId, role: "klien" as Role };
  });
}

export async function login(input: LoginInput) {
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, input.emailOrUsername), eq(users.username, input.emailOrUsername)))
    .limit(1);

  if (!user) throw new AppError(401, "Email/username atau password salah");

  const valid = await argon2.verify(user.passwordHash, input.password);
  if (!valid) throw new AppError(401, "Email/username atau password salah");

  const token = issueToken({ id: user.id, role: user.role });
  return { token, role: user.role };
}
