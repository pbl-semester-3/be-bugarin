import { z } from "zod";

export const updateProfileSchema = z.object({
  nama: z.string().min(1).optional(),
  usia: z.number().int().positive().optional(),
  jenisKelamin: z.enum(["pria", "wanita"]).optional(),
  alergiMakanan: z.string().optional(),
  tinggiBadanCm: z.number().positive().optional(),
});

export const changePasswordSchema = z.object({
  passwordSaatIni: z.string().min(1, "Password saat ini harus diisi"),
  passwordBaru: z.string().min(8, "Password baru minimal 8 karakter"),
});

export const changeThemeSchema = z.object({
  tema: z.enum(["siang", "malam"]),
});

export const weightLogSchema = z.object({
  beratBadanKg: z.number().positive("Berat badan harus bernilai positif"),
});

export const newCycleSchema = z.object({
  bbTujuanKg: z.number().positive("Berat badan tujuan harus bernilai positif"),
  tujuan: z.enum(["turun_bb", "naik_bb"]),
  durasiHari: z.number().int().positive("Durasi hari harus bilangan bulat positif"),
  bbAwalKg: z.number().positive().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeThemeInput = z.infer<typeof changeThemeSchema>;
export type WeightLogInput = z.infer<typeof weightLogSchema>;
export type NewCycleInput = z.infer<typeof newCycleSchema>;
