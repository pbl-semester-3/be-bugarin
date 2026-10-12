import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

// SDK Cloudinary otomatis membaca CLOUDINARY_URL dari env, tapi kita set eksplisit
// agar jelas & aman (tidak bergantung urutan import).
if (env.CLOUDINARY_URL) {
  cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL, secure: true });
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_URL);
}

// URL foto dibangun saat response dari public_id Cloudinary (DB tidak menyimpan URL absolut).
// Dipakai bersama oleh semua role (klien, PT).
export function buildCloudinaryUrl(publicId: string | null): string | null {
  if (!publicId) return null;
  return cloudinary.url(publicId, { secure: true });
}

export { cloudinary };
