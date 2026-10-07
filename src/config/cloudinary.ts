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

export { cloudinary };
