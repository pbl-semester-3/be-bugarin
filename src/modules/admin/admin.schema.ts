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

// ==== CRUD User ====
export const getUsersQuerySchema = z.object({
  role: z.enum(["klien", "pt"], { message: "role wajib diisi (klien/pt)" }),
});

// Admin mengetik password manual saat membuat akun PT.
export const createPtSchema = z.object({
  nama: z.string().min(1, "Nama tidak boleh kosong"),
  email: z.string().email("Format email tidak valid"),
  username: z.string().min(3, "Username minimal 3 karakter").max(50),
  password: z.string().min(8, "Password minimal 8 karakter"),
});

// password? = password baru (opsional); hanya klien/PT yang boleh jadi target.
export const updateUserSchema = z.object({
  nama: z.string().min(1, "Nama tidak boleh kosong").optional(),
  email: z.string().email("Format email tidak valid").optional(),
  username: z.string().min(3, "Username minimal 3 karakter").max(50).optional(),
  password: z.string().min(8, "Password minimal 8 karakter").optional(),
}).strict();

export type GetUsersQueryInput = z.infer<typeof getUsersQuerySchema>;
export type CreatePtInput = z.infer<typeof createPtSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const getRiwayatQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100, "Limit maksimal 100").default(50),
});
export type GetRiwayatQueryInput = z.infer<typeof getRiwayatQuerySchema>;
