import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../config/db";
import { users } from "../db/schema";

// Username PT bersifat permanen (tidak bisa diubah PT maupun Admin).
// Basis dari prefix email + suffix angka acak bila sudah dipakai.
export async function generateUniqueUsername(email: string): Promise<string> {
  const base =
    (email.split("@")[0] || "user")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 20) || "user";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base}${randomInt(1000, 9999)}`;
    const existing = await db.query.users.findFirst({
      where: eq(users.username, candidate),
    });
    if (!existing) return candidate;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
}
