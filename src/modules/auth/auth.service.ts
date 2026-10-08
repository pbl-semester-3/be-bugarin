import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomBytes, randomInt } from "crypto";
import { eq, or } from "drizzle-orm";
import { db } from "../../config/db";
import { env } from "../../config/env";
import { users, klienProfiles } from "../../db/schema";
import { AppError } from "../../middlewares/error-handler";
import { googleAuth } from "./google";
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

async function generateUniqueUsername(email: string): Promise<string> {
  const base =
    (email.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20) || "user";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}${randomInt(1000, 9999)}`;
    const existing = await db.query.users.findFirst({ where: eq(users.username, candidate) });
    if (!existing) return candidate;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
}

// OAuth Google: hanya untuk klien. Akun Google-only (password acak dormant, tak diketahui siapa pun).
export async function loginWithGoogle(idToken: string) {
  if (!googleAuth.isConfigured()) {
    throw new AppError(503, "Login Google belum dikonfigurasi");
  }

  const payload = await googleAuth.verifyIdToken(idToken);
  if (!payload.email || payload.emailVerified !== true) {
    throw new AppError(401, "Akun Google belum terverifikasi");
  }
  const email = payload.email.toLowerCase();

  // 1. Sudah pernah login Google -> cocokkan via google_id (stabil, walau email berubah).
  const byGoogleId = await db.query.users.findFirst({ where: eq(users.googleId, payload.sub) });
  if (byGoogleId) {
    if (byGoogleId.role !== "klien") {
      throw new AppError(403, "Akun ini bukan akun klien");
    }
    return { token: issueToken({ id: byGoogleId.id, role: byGoogleId.role }), role: byGoogleId.role };
  }

  // 2. Email sudah terdaftar -> link google_id (hanya untuk klien).
  const byEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (byEmail) {
    if (byEmail.role !== "klien") {
      throw new AppError(403, "Akun ini bukan akun klien");
    }
    if (byEmail.googleId && byEmail.googleId !== payload.sub) {
      throw new AppError(409, "Email sudah terhubung ke akun Google lain");
    }
    if (!byEmail.googleId) {
      await db.update(users).set({ googleId: payload.sub }).where(eq(users.id, byEmail.id));
    }
    return { token: issueToken({ id: byEmail.id, role: byEmail.role }), role: byEmail.role };
  }

  // 3. Klien baru -> buat user + klien_profiles dalam satu transaksi.
  const username = await generateUniqueUsername(email);
  const passwordHash = await argon2.hash(randomBytes(32).toString("hex"));
  const nama = payload.name?.trim() || email.split("@")[0];

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(users).values({
      email,
      username,
      passwordHash,
      role: "klien",
      googleId: payload.sub,
    });
    await tx.insert(klienProfiles).values({
      userId: inserted.insertId,
      nama,
    });
    return { id: inserted.insertId, role: "klien" as Role };
  });

  return { token: issueToken(created), role: created.role };
}
