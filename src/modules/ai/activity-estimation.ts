import { SchemaType } from "@google/generative-ai";
import { genAI } from "../../config/gemini";
import { withTimeout } from "./with-timeout";

const activityEstimationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    kaloriTerbakar: { type: SchemaType.NUMBER },
  },
  required: ["kaloriTerbakar"],
};

export type ActivityEstimationInput = {
  namaOlahraga: string;
  metValue: number;
  beratBadanKg: number;
  usia: number | null;
  jenisKelamin: "pria" | "wanita" | null;
  tinggiBadanCm: number | null;
  durasiMenit: number;
  beratBebanKg: number;
  jumlahSet: number;
  repetisi: number;
  waktuIstirahatDetik: number;
};

/// Fallback deterministik bila AI gagal/tidak tersedia.
/// Heuristic gabungan MET (berbasis durasi) + volume latihan (beban x rep x set),
/// konstanta 0.05 kkal per kg volume adalah estimasi kasar yang didokumentasikan.
export function hitungKaloriFallback(input: ActivityEstimationInput): number {
  const metKalori = input.metValue * input.beratBadanKg * (input.durasiMenit / 60);
  const volumeKg = input.beratBebanKg * input.repetisi * input.jumlahSet;
  const volumeKalori = 0.05 * volumeKg;
  return Math.max(1, Math.round(0.5 * metKalori + 0.5 * volumeKalori));
}

/// Estimasi kalori latihan beban via Gemini. Bila AI gagal / hasil tidak wajar,
/// pakai `hitungKaloriFallback` agar alur tetap jalan.
export async function estimateActivityCalories(
  input: ActivityEstimationInput
): Promise<number> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction:
        "Kamu adalah asisten kebugaran yang mengestimasi kalori terbakar dari sesi latihan beban. " +
        "Gunakan data berat badan, durasi, beban, jumlah set, repetisi, dan jeda istirahat " +
        "untuk memperkirakan total kalori terbakar sesi ini secara realistis. " +
        "Kembalikan hanya total kalori (angka) untuk seluruh sesi.",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: activityEstimationSchema,
      },
    });

    const result = await withTimeout(
      model.generateContent(
        JSON.stringify({
          olahraga: input.namaOlahraga,
          met: input.metValue,
          beratBadanKg: input.beratBadanKg,
          usia: input.usia,
          jenisKelamin: input.jenisKelamin,
          tinggiBadanCm: input.tinggiBadanCm,
          durasiMenit: input.durasiMenit,
          beratBebanKg: input.beratBebanKg,
          jumlahSet: input.jumlahSet,
          repetisi: input.repetisi,
          waktuIstirahatDetik: input.waktuIstirahatDetik,
        })
      ),
      8000,
      "AI activity estimation"
    );

    const parsed = JSON.parse(result.response.text()) as { kaloriTerbakar?: number };
    const kalori = parsed.kaloriTerbakar;

    // Validasi rentang wajar — jangan percaya angka mentah dari AI (mitigasi hallucination).
    if (typeof kalori !== "number" || kalori <= 0 || kalori > 5000) {
      return hitungKaloriFallback(input);
    }
    return Math.round(kalori);
  } catch (error) {
    console.error("AI activity estimation error, applying fallback:", error);
    return hitungKaloriFallback(input);
  }
}
