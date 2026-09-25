import { z } from "zod";

export const respondPairingRequestSchema = z.object({
  alasanPenolakan: z.string().min(1, "Alasan penolakan tidak boleh kosong jika diisi").max(500, "Maksimal 500 karakter").optional(),
});

export type RespondPairingRequestInput = z.infer<typeof respondPairingRequestSchema>;
