import { SchemaType } from "@google/generative-ai";
import { genAI } from "../../config/gemini";

const feedbackSchema = {
  type: SchemaType.OBJECT,
  properties: { pesan: { type: SchemaType.STRING } },
  required: ["pesan"],
};

export interface WeeklyFeedbackContext {
  tujuan: string;
  targetKaloriPerHari: number;
  totalHariKosong: number;
  logs: {
    tanggal: string;
    kaloriMasuk: number;
    kaloriKeluar: number;
  }[];
}

export async function generateWeeklyFeedback(context: WeeklyFeedbackContext): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction:
      "Kamu adalah AI health coach yang suportif dan observatif. " +
      "Maksimal 2 kalimat. Konteksnya adalah rekap performa mingguan. " +
      "Singgung positif dari catatan log atau berikan dorongan proaktif jika ada hari yang bolong (tanpa data). " +
      "Tidak memberi saran medis spesifik.",
    generationConfig: { responseMimeType: "application/json", responseSchema: feedbackSchema },
  });

  const promptText = `
    Tujuan Klien: ${context.tujuan}
    Target Kalori Harian: ${context.targetKaloriPerHari} kcal
    Hari Tanpa Catatan (7 hari terakhir): ${context.totalHariKosong} hari

    Catatan Harian (Hanya menampilkan hari dengan data):
    ${context.logs.map(l => `- ${l.tanggal}: Masuk ${l.kaloriMasuk} kcal, Keluar ${l.kaloriKeluar} kcal`).join("\n")}
    
    Tolong berikan komentar / feedback berdasarkan performa di atas.
  `;

  const result = await model.generateContent(promptText);
  const parsed = JSON.parse(result.response.text()) as { pesan: string };
  return parsed.pesan;
}
