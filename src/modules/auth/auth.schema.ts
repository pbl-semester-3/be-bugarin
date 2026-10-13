import { z } from "zod";

export const registerSchema = z.object({
  nama: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email("Format email tidak valid"),
  username: z.string().min(3, "Username minimal 3 karakter").max(50),
  password: z.string().min(8, "Password minimal 8 karakter"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  emailOrUsername: z.string().min(1, "Email/username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const oauthGoogleSchema = z.object({
  idToken: z.string().min(1, "idToken wajib diisi"),
});
export type OauthGoogleInput = z.infer<typeof oauthGoogleSchema>;
