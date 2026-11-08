import { SchemaType } from "@google/generative-ai";
import { genAI, GEMINI_MODEL } from "../../config/gemini";
import { withTimeout } from "./with-timeout";
import { normalizeHari } from "../../utils/day";
import {
  DEFAULT_DURATION_MIN,
  formatRange,
  hasTimeConflict,
  parseTimeRange,
  pickFreeSlots,
} from "../../utils/schedule";
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

export type WeeklyPlanInput = {
  tinggiBadanCm: number | null;
  alergiMakanan: string | null;
  bbAwalKg: number;
  bbSekarangKg: number;
  bbTujuanKg: number;
  tujuan: "turun_bb" | "naik_bb";
  tempatGym: string; // disisipkan ke hasil setelah parse, TIDAK diminta ke AI
  // Slot klien lain pada PT yang sama (untuk menghindari jadwal bentrok).
  occupiedSlots?: Array<{ hari: string; jam: string }>;
  // Variasi deterministik (mis. klienId) agar jadwal antar klien berbeda.
  seed?: number;
};

export type WeeklyPlanResult = { workoutPlan: WorkoutPlanItem[]; mealPlan: MealPlanItem[] };

// AI bisa 503/lambat (pernah >50s). Batasi; jika lewat -> fallback deterministik.
const AI_TIMEOUT_MS = 15_000;

async function generateWithAI(input: WeeklyPlanInput): Promise<WeeklyPlanResult> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction:
      "Kamu adalah asisten perencana program kebugaran. Susun 2-3 sesi latihan/minggu, " +
      "tiap sesi 90 menit, format jam 'HH:MM - HH:MM', hari dan jam bervariasi, jam wajar " +
      "06:00-21:00 pada hari Senin-Sabtu. JANGAN memakai slot yang sudah terpakai " +
      "(lihat slotTerpakai). Susun juga rencana makan harian. JANGAN sarankan makanan yang " +
      "mengandung alergi yang disebutkan.",
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
      slotTerpakai: input.occupiedSlots ?? [],
    }),
  );

  const parsed = JSON.parse(result.response.text()) as GeneratedPlan;

  return {
    // Lokasi diisi dari data pasti (pt_profiles.tempat_gym), bukan dari AI — anti-hallucination
    workoutPlan: parsed.workoutPlan.map((item) => ({ ...item, lokasi: input.tempatGym })),
    mealPlan: parsed.mealPlan,
  };
}

const FALLBACK_JENIS: Record<"turun_bb" | "naik_bb", string[]> = {
  turun_bb: [
    "Kardio (jalan cepat/bersepeda) + peregangan",
    "Latihan kekuatan ringan seluruh tubuh",
    "Kardio interval ringan + latihan core",
  ],
  naik_bb: [
    "Latihan beban upper body",
    "Latihan beban lower body",
    "Latihan beban full body",
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
 * Plan cadangan deterministik (tanpa AI): pilih slot bebas 90 menit (06:00-21:00,
 * Senin-Sabtu) yang divariasikan berdasarkan `seed` agar antar klien berbeda hari/jam.
 * Jika slot habis, sesi dikurangi (lebih baik sedikit tetapi tidak bentrok).
 */
export function buildFallbackWeeklyPlan(input: {
  tujuan: "turun_bb" | "naik_bb";
  tempatGym: string;
  occupiedSlots?: Array<{ hari: string; jam: string }>;
  seed?: number;
}): WeeklyPlanResult {
  const slots = pickFreeSlots(input.occupiedSlots ?? [], 3, input.seed ?? 0);
  const jenisList = FALLBACK_JENIS[input.tujuan];

  return {
    workoutPlan: slots.map((slot, index) => ({
      hari: slot.hari,
      jam: slot.jam,
      jenis: jenisList[index % jenisList.length],
      lokasi: input.tempatGym,
    })),
    mealPlan: FALLBACK_MEAL[input.tujuan].map((item) => ({ ...item })),
  };
}

// Pastikan hasil AI tidak bentrok: geser ke slot bebas, atau buang sesi bila penuh.
function resolveWorkoutConflicts(
  items: WorkoutPlanItem[],
  occupied: Array<{ hari: string; jam: string }>,
  seed: number,
): WorkoutPlanItem[] {
  const result: WorkoutPlanItem[] = [];
  let reserved = [...occupied];

  items.forEach((item, index) => {
    const day = normalizeHari(item.hari);
    const range = parseTimeRange(item.jam, DEFAULT_DURATION_MIN);

    if (range && !hasTimeConflict(day, range, reserved, DEFAULT_DURATION_MIN)) {
      const normalized = {
        hari: day,
        jam: formatRange(range),
        jenis: item.jenis,
        lokasi: item.lokasi,
      };
      result.push(normalized);
      reserved = [...reserved, { hari: normalized.hari, jam: normalized.jam }];
      return;
    }

    const free = pickFreeSlots(reserved, 1, seed + index);
    if (free.length > 0) {
      const slot = free[0];
      result.push({ hari: slot.hari, jam: slot.jam, jenis: item.jenis, lokasi: item.lokasi });
      reserved = [...reserved, slot];
    }
    // Jika tidak ada slot bebas: sesi dibuang (Opsi A).
  });

  return result;
}

export async function generateWeeklyPlan(input: WeeklyPlanInput): Promise<WeeklyPlanResult> {
  const occupied = input.occupiedSlots ?? [];
  const seed = input.seed ?? 0;

  let base: WeeklyPlanResult;
  try {
    base = await withTimeout(generateWithAI(input), AI_TIMEOUT_MS, "generateWeeklyPlan");
    if (base.workoutPlan.length === 0) {
      base = buildFallbackWeeklyPlan({ ...input, occupiedSlots: occupied, seed });
    }
  } catch (err) {
    console.error(
      "generateWeeklyPlan: AI gagal/timeout, memakai fallback:",
      (err as Error).message,
    );
    base = buildFallbackWeeklyPlan({ ...input, occupiedSlots: occupied, seed });
  }

  return {
    workoutPlan: resolveWorkoutConflicts(base.workoutPlan, occupied, seed),
    mealPlan: base.mealPlan,
  };
}
