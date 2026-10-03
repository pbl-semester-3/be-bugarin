import { z } from "zod";

export const respondPairingRequestSchema = z.object({
  alasanPenolakan: z.string().min(1, "Alasan penolakan tidak boleh kosong jika diisi").max(500, "Maksimal 500 karakter").optional(),
});

export type RespondPairingRequestInput = z.infer<typeof respondPairingRequestSchema>;

// .strict(): field di luar daftar (mis. email/username) ditolak 400, bukan diabaikan diam-diam.
// email/username hanya boleh diubah Admin, bukan oleh PT.
export const updatePtProfileSchema = z.object({
  nama: z.string().min(1, "Nama tidak boleh kosong").optional(),
  usia: z.number().int().positive("Usia harus bilangan bulat positif").optional(),
  jenisKelamin: z.enum(["pria", "wanita"]).optional(),
  spesialisasi: z.enum(["turun_bb", "naik_bb"]).optional(),
  tempatGym: z.string().min(1, "Tempat gym tidak boleh kosong").optional(),
}).strict();

export const changePtPasswordSchema = z.object({
  passwordSaatIni: z.string().min(1, "Password saat ini harus diisi"),
  passwordBaru: z.string().min(8, "Password baru minimal 8 karakter"),
});

export const changePtThemeSchema = z.object({
  tema: z.enum(["siang", "malam"]),
});

export type UpdatePtProfileInput = z.infer<typeof updatePtProfileSchema>;
export type ChangePtPasswordInput = z.infer<typeof changePtPasswordSchema>;
export type ChangePtThemeInput = z.infer<typeof changePtThemeSchema>;
