import { SchemaType } from "@google/generative-ai";
import { genAI } from "../../config/gemini";
import type { WorkoutPlanItem, MealPlanItem } from "../../db/schema/weekly-plans";

const weeklyPlanSchema = {
  type: SchemaType.OBJECT,
  properties: {
    workoutPlan: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          hari: { type: SchemaType.STRING },
          jam: { type: SchemaType.STRING },
          jenis: { type: SchemaType.STRING },
        },
        required: ["hari", "jam", "jenis"],
      },
    },
    mealPlan: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          waktu: { type: SchemaType.STRING },
          menu: { type: SchemaType.STRING },
          estimasiKalori: { type: SchemaType.NUMBER },
        },
        required: ["waktu", "menu", "estimasiKalori"],
      },
    },
  },
  required: ["workoutPlan", "mealPlan"],
};

type GeneratedPlan = {
  workoutPlan: Array<{ hari: string; jam: string; jenis: string }>;
  mealPlan: MealPlanItem[];
};

export async function generateWeeklyPlan(input: {
  tinggiBadanCm: number | null;
  alergiMakanan: string | null;
  bbAwalKg: number;
  bbSekarangKg: number;
  bbTujuanKg: number;
  tujuan: "turun_bb" | "naik_bb";
  tempatGym: string; // disisipkan ke hasil setelah parse, TIDAK diminta ke AI
}): Promise<{ workoutPlan: WorkoutPlanItem[]; mealPlan: MealPlanItem[] }> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction:
      "Kamu adalah asisten perencana program kebugaran. Susun jadwal latihan 2-3 hari/minggu " +
      "dan rencana makan harian. JANGAN sarankan makanan yang mengandung alergi yang disebutkan.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: weeklyPlanSchema,
    },
  });

  const result = await model.generateContent(
    JSON.stringify({
      tinggiBadanCm: input.tinggiBadanCm,
      alergiMakanan: input.alergiMakanan ?? "tidak ada",
      bbAwalKg: input.bbAwalKg,
      bbSekarangKg: input.bbSekarangKg,
      bbTujuanKg: input.bbTujuanKg,
      tujuan: input.tujuan,
    })
  );

  const parsed = JSON.parse(result.response.text()) as GeneratedPlan;

  return {
    // Lokasi diisi dari data pasti (pt_profiles.tempat_gym), bukan dari AI — anti-hallucination
    // (lihat skill gemini-structured-output).
    workoutPlan: parsed.workoutPlan.map((item) => ({ ...item, lokasi: input.tempatGym })),
    mealPlan: parsed.mealPlan,
  };
}
