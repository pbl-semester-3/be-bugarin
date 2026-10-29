import { SchemaType } from "@google/generative-ai";
import { genAI } from "../../config/gemini";
import { withTimeout } from "./with-timeout";

const foodEstimationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    kaloriPer100g: { type: SchemaType.NUMBER },
    kategori: { type: SchemaType.STRING, enum: ["karbohidrat", "protein", "sayur", "lainnya"] },
  },
  required: ["kaloriPer100g", "kategori"],
};

type Kategori = "karbohidrat" | "protein" | "sayur" | "lainnya";

export async function estimateFoodCalories(
  namaMakanan: string
): Promise<{ kaloriPer100g: number; kategori: Kategori }> {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction: "Kamu adalah asisten estimasi nilai gizi makanan Indonesia.",
    generationConfig: { responseMimeType: "application/json", responseSchema: foodEstimationSchema },
  });

  try {
    const result = await withTimeout(
      model.generateContent(`Estimasi kalori per 100 gram untuk: ${namaMakanan}`),
      8000,
      "AI food estimation"
    );
    const parsed = JSON.parse(result.response.text()) as { kaloriPer100g: number; kategori: Kategori };

    // Validasi rentang wajar — WAJIB, jangan percaya angka mentah dari AI (mitigasi hallucination).
    if (parsed.kaloriPer100g < 0 || parsed.kaloriPer100g > 900) {
      return { kaloriPer100g: 150, kategori: "lainnya" };
    }
    return parsed;
  } catch (error) {
    console.error("AI estimation error, applying fallback:", error);
    return { kaloriPer100g: 150, kategori: "lainnya" };
  }
}
