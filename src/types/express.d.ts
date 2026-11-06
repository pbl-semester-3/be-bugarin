import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    user?: { id: number; role: "klien" | "pt" | "admin" };
    // Diisi middleware request-id; selalu ada saat aplikasi berjalan normal.
    id?: string;
    // Waktu mulai request (epoch ms) untuk menghitung durasi.
    startedAt?: number;
  }
}
