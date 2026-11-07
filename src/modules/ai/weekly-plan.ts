import { SchemaType } from "@google/generative-ai";
import { genAI, GEMINI_MODEL } from "../../config/gemini";
import { withTimeout } from "./with-timeout";
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

type WeeklyPlanInput = {
  tinggiBadanCm: number | null;
  alergiMakanan: string | null;
  bbAwalKg: number;
  bbSekarangKg: number;
  bbTujuanKg: number;
  tujuan: "turun_bb" | "naik_bb";
  tempatGym: string; // disisipkan ke hasil setelah parse, TIDAK diminta ke AI
};

export type WeeklyPlanResult = { workoutPlan: WorkoutPlanItem[]; mealPlan: MealPlanItem[] };

// AI bisa 503/lambat (pernah >50s). Batasi; jika lewat → pakai fallback deterministik.
const AI_TIMEOUT_MS = 15_000;

async function generateWithAI(input: WeeklyPlanInput): Promise<WeeklyPlanResult> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
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
    workoutPlan: parsed.workoutPlan.map((item) => ({ ...item, lokasi: input.tempatGym })),
    mealPlan: parsed.mealPlan,
  };
}

const FALLBACK_WORKOUT: Record<"turun_bb" | "naik_bb", Array<{ hari: string; jam: string; jenis: string }>> = {
  turun_bb: [
    { hari: "Senin", jam: "07:00 - 08:00", jenis: "Kardio (jalan cepat/bersepeda) + peregangan" },
    { hari: "Rabu", jam: "07:00 - 08:00", jenis: "Latihan kekuatan ringan seluruh tubuh" },
    { hari: "Jumat", jam: "07:00 - 08:00", jenis: "Kardio interval ringan + latihan core" },
  ],
  naik_bb: [
    { hari: "Senin", jam: "17:00 - 18:00", jenis: "Latihan beban upper body" },
    { hari: "Rabu", jam: "17:00 - 18:00", jenis: "Latihan beban lower body" },
    { hari: "Jumat", jam: "17:00 - 18:00", jenis: "Latihan beban full body" },
  ],
};

const FALLBACK_MEAL: Record<"turun_bb" | "naik_bb", MealPlanItem[]> = {
  turun_bb: [
    { waktu: "Sarapan", menu: "Oatmeal + telur rebus + buah", estimasiKalori: 400 },
    { waktu: "Makan Siang", menu: "Nasi merah + ayam panggang + sayur", estimasiKalori: 550 },
    { waktu: "Camilan", menu: "Yogurt + buah", estimasiKalori: 200 },
    { waktu: "Makan Malam", menu: "Nasi merah + ikan + sayur", estimasiKalori: 550 },
  ],
  naik_bb: [
    { waktu: "Sarapan", menu: "Nasi + telur + susu", estimasiKalori: 600 },
    { waktu: "Makan Siang", menu: "Nasi + ayam + sayur", estimasiKalori: 750 },
    { waktu: "Camilan", menu: "Roti gandum + selai kacang + buah", estimasiKalori: 450 },
    { waktu: "Makan Malam", menu: "Nasi + ikan/daging + sayur", estimasiKalori: 600 },
  ],
};

/**
 * Plan cadangan deterministik (tanpa AI): dipakai bila Gemini gagal/timeout agar fitur
 * tetap menghasilkan jadwal. PT tetap me-review/override, termasuk untuk alergi.
 */
export function buildFallbackWeeklyPlan(input: {
  tujuan: "turun_bb" | "naik_bb";
  tempatGym: string;
}): WeeklyPlanResult {
  return {
    workoutPlan: FALLBACK_WORKOUT[input.tujuan].map((item) => ({
      ...item,
      lokasi: input.tempatGym,
    })),
    mealPlan: FALLBACK_MEAL[input.tujuan].map((item) => ({ ...item })),
  };
}

export async function generateWeeklyPlan(input: WeeklyPlanInput): Promise<WeeklyPlanResult> {
  try {
    return await withTimeout(generateWithAI(input), AI_TIMEOUT_MS, "generateWeeklyPlan");
  } catch (err) {
    console.error(
      "generateWeeklyPlan: AI gagal/timeout, memakai fallback:",
      (err as Error).message
    );
    return buildFallbackWeeklyPlan(input);
  }
}
