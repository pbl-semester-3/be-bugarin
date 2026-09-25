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

export const createActivityLogSchema = z.object({
  olahragaId: z.number().int().positive("Olahraga ID harus positif"),
  durasiMenit: z.number().int().positive("Durasi menit harus positif"),
  jarakMeter: z.number().positive("Jarak harus positif").optional(),
  weeklyPlanId: z.number().int().positive().optional(),
});

export const createMealLogSchema = z.object({
  makananId: z.number().int().positive().optional(),
  namaMakanan: z.string().min(1).max(150).optional(),
  porsiGram: z.number().positive("Porsi gram harus positif"),
  weeklyPlanId: z.number().int().positive().optional(),
}).refine((data) => data.makananId !== undefined || data.namaMakanan !== undefined, {
  message: "Harus mengirim makananId atau namaMakanan",
  path: ["makananId", "namaMakanan"], // Memberikan marker error pada field
});

export type CreateActivityLogInput = z.infer<typeof createActivityLogSchema>;
export type CreateMealLogInput = z.infer<typeof createMealLogSchema>;
