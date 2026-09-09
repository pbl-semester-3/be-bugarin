import { SchemaType } from "@google/generative-ai";
import { genAI } from "../../config/gemini";

const feedbackSchema = {
  type: SchemaType.OBJECT,
  properties: { pesan: { type: SchemaType.STRING } },
  required: ["pesan"],
};

// TODO: input sebenarnya harus berisi ringkasan histori 7 hari terakhir klien
// (kalori masuk/keluar, tren BB) — lihat Bugarin_PRD_Backend_AI.md bab 6.2.
export async function generateRealtimeFeedback(context: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction:
      "Kamu adalah AI health coach yang suportif dan singkat. Maksimal 2 kalimat. " +
      "Tidak memberi saran medis spesifik.",
    generationConfig: { responseMimeType: "application/json", responseSchema: feedbackSchema },
  });

  const result = await model.generateContent(context);
  const parsed = JSON.parse(result.response.text()) as { pesan: string };
  return parsed.pesan;
}
