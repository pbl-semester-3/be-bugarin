import { z } from "zod";

// Admin boleh mengubah email & username miliknya sendiri (beda dari PT).
// .strict(): tolak field tak dikenal.
export const updateAdminProfileSchema = z.object({
  nama: z.string().min(1, "Nama tidak boleh kosong").optional(),
  email: z.string().email("Format email tidak valid").optional(),
  username: z.string().min(3, "Username minimal 3 karakter").max(50).optional(),
}).strict();

export const changeAdminPasswordSchema = z.object({
  passwordSaatIni: z.string().min(1, "Password saat ini harus diisi"),
  passwordBaru: z.string().min(8, "Password baru minimal 8 karakter"),
});

export const changeAdminThemeSchema = z.object({
  tema: z.enum(["siang", "malam"]),
});

export type UpdateAdminProfileInput = z.infer<typeof updateAdminProfileSchema>;
export type ChangeAdminPasswordInput = z.infer<typeof changeAdminPasswordSchema>;
export type ChangeAdminThemeInput = z.infer<typeof changeAdminThemeSchema>;
