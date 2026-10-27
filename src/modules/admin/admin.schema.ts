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
// Field profil PT opsional di API (wajib di UI) agar kompatibel mundur.
const ptProfileFields = {
  usia: z.number().int().min(13, "Usia minimal 13 tahun").optional(),
  jenisKelamin: z.enum(["pria", "wanita"]).optional(),
  whatsapp: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,14}$/, "Format WhatsApp hanya '+' dan angka")
    .optional(),
  tempatGym: z.string().min(3, "Tempat gym minimal 3 karakter").optional(),
  spesialisasi: z.enum(["turun_bb", "naik_bb"]).optional(),
};

export const createPtSchema = z.object({
  nama: z.string().min(1, "Nama tidak boleh kosong"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter"),
  ...ptProfileFields,
});

// password? = password baru (opsional); hanya klien/PT yang boleh jadi target.
// username PT immutable (ditolak di service), field profil PT hanya untuk role pt.
export const updateUserSchema = z.object({
  nama: z.string().min(1, "Nama tidak boleh kosong").optional(),
  email: z.string().email("Format email tidak valid").optional(),
  username: z.string().min(3, "Username minimal 3 karakter").max(50).optional(),
  password: z.string().min(8, "Password minimal 8 karakter").optional(),
  // Khusus target PT: suspend (false) / aktifkan kembali (true).
  isActive: z.boolean().optional(),
  ...ptProfileFields,
}).strict();

export type GetUsersQueryInput = z.infer<typeof getUsersQuerySchema>;
export type CreatePtInput = z.infer<typeof createPtSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const getRiwayatQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100, "Limit maksimal 100").default(50),
});
export type GetRiwayatQueryInput = z.infer<typeof getRiwayatQuerySchema>;
