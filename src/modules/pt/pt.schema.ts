import { z } from "zod";

export const respondPairingRequestSchema = z.object({
  alasanPenolakan: z.string().min(1, "Alasan penolakan tidak boleh kosong jika diisi").max(500, "Maksimal 500 karakter").optional(),
});

export type RespondPairingRequestInput = z.infer<typeof respondPairingRequestSchema>;

// .strict(): field di luar daftar (mis. email/username) ditolak 400, bukan diabaikan diam-diam.
// email/username hanya boleh diubah Admin, bukan oleh PT.
export const updatePtProfileSchema = z.object({
  nama: z.string().min(2, "Nama minimal 2 karakter").optional(),
  usia: z.number().int().min(13, "Usia minimal 13 tahun").optional(),
  jenisKelamin: z.enum(["pria", "wanita"]).optional(),
  spesialisasi: z.enum(["turun_bb", "naik_bb"]).optional(),
  tempatGym: z.string().min(3, "Tempat gym minimal 3 karakter").optional(),
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

// Override weekly plan: PT TIDAK mengirim `lokasi` (backend inject dari tempat_gym).
// .strict() di semua level agar field ekstra (mis. lokasi) ditolak 400.
export const overridePlanSchema = z.object({
  workoutPlan: z.array(
    z.object({
      hari: z.string().min(1, "Hari tidak boleh kosong"),
      jam: z.string().min(1, "Jam tidak boleh kosong"),
      jenis: z.string().min(1, "Jenis tidak boleh kosong"),
    }).strict(),
  ).min(1, "Workout plan minimal 1 jadwal"),
  mealPlan: z.array(
    z.object({
      waktu: z.string().min(1, "Waktu tidak boleh kosong"),
      menu: z.string().min(1, "Menu tidak boleh kosong"),
      estimasiKalori: z.number().positive("Estimasi kalori harus positif"),
    }).strict(),
  ).min(1, "Meal plan minimal 1 jadwal"),
}).strict();

export type OverridePlanInput = z.infer<typeof overridePlanSchema>;

export const createFeedbackSchema = z.object({
  pesan: z.string().trim().min(5, "Pesan feedback tidak boleh terlalu singkat").max(2000, "Pesan terlalu panjang"),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
