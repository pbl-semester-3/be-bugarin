---
name: gemini-structured-output
description: Pola pemanggilan Gemini API dari backend Express dengan output JSON terstruktur (responseSchema) untuk 3 kebutuhan AI Bugarin — Weekly Plan, feedback real-time, dan estimasi kalori makanan. Gunakan saat mengerjakan modul ai/.
metadata:
  origin: bugarin-project
  sources: "Google AI for Developers - Structured Output docs (dicek via Context7 sebelum implementasi, lihat skill context7-docs-lookup)"
---

# Gemini Structured Output (Bugarin)

Seluruh panggilan Gemini API **wajib** dari backend (modul `ai/`), tidak pernah dari Mobile/Web langsung — ini requirement wajib kampus, bukan sekadar preferensi. Skill ini fokus ke cara memastikan output AI selalu berupa JSON valid yang bisa langsung divalidasi dan disimpan, memakai fitur `responseSchema` bawaan Gemini API (bukan minta model "tolong balas JSON" lewat prompt teks biasa, yang tidak dijamin).

**Sebelum implementasi**, cek skill `context7-docs-lookup` — pastikan bentuk API `@google/generative-ai` (nama field, method) masih sesuai versi terbaru, karena SDK ini sering update.

## Activation

- Menulis/mengubah fungsi generate Weekly Plan (`ai/weekly-plan.ts`).
- Menulis/mengubah fungsi feedback real-time (`ai/feedback.ts`).
- Menulis/mengubah fungsi estimasi kalori makanan custom (`ai/food-estimation.ts`).

## Prinsip Inti: `responseMimeType` + `responseSchema`

Jangan andalkan instruksi prompt semata ("balas dalam format JSON") — Gemini tidak menjamin itu tanpa `responseSchema`. Selalu set dua field di `generationConfig`:

```typescript
// config/gemini.ts
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { env } from "./env";

export const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
```

## Pola 1: Generate Weekly Plan

```typescript
// modules/ai/weekly-plan.ts
import { SchemaType } from "@google/generative-ai";
import { genAI } from "../../config/gemini";

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
        // lokasi TIDAK diminta ke AI — diisi backend dari pt_profiles.tempat_gym
        // setelah response diterima, supaya tidak ada risiko AI mengarang lokasi.
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

export async function generateWeeklyPlan(input: {
  tinggiBadanCm: number;
  alergiMakanan: string | null;
  bbAwal: number;
  bbSekarang: number;
  bbTujuan: number;
  tujuan: "turun_bb" | "naik_bb";
}) {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction:
      "Kamu adalah asisten perencana program kebugaran. Susun jadwal latihan 2-3 hari/minggu " +
      "dan rencana makan harian. JANGAN sarankan makanan yang mengandung alergi yang disebutkan.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: weeklyPlanSchema,
    },
  });

  const result = await model.generateContent(JSON.stringify(input));
  const parsed = JSON.parse(result.response.text()); // aman di-parse, sudah dijamin schema

  // Sisipkan lokasi dari data pasti (bukan dari AI) SETELAH parse:
  return {
    workoutPlan: parsed.workoutPlan.map((item: any) => ({ ...item, lokasi: input /* tempat_gym via param terpisah */ })),
    mealPlan: parsed.mealPlan,
  };
}
```

**Kenapa lokasi gym tidak diminta ke AI**: itu data pasti yang sudah ada di database (`pt_profiles.tempat_gym`). Minta AI menyalin ulang data yang sudah pasti hanya menambah risiko hallucination tanpa manfaat — sisipkan di backend setelah response diterima.

## Pola 2: Feedback Real-time (teks bebas, bukan JSON kompleks)

Untuk output yang cukup berupa teks pendek, tetap pakai `responseSchema` dengan satu field string — lebih aman daripada parsing teks bebas yang mungkin diawali kalimat pembuka tidak perlu:

```typescript
const feedbackSchema = {
  type: SchemaType.OBJECT,
  properties: { pesan: { type: SchemaType.STRING } },
  required: ["pesan"],
};

const model = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
  systemInstruction:
    "Kamu adalah AI health coach yang suportif dan singkat. Maksimal 2 kalimat. " +
    "Tidak memberi saran medis spesifik.",
  generationConfig: { responseMimeType: "application/json", responseSchema: feedbackSchema },
});
```

## Pola 3: Estimasi Kalori Makanan Custom (dengan validasi rentang)

```typescript
const foodEstimationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    kaloriPer100g: { type: SchemaType.NUMBER },
    kategori: {
      type: SchemaType.STRING,
      enum: ["karbohidrat", "protein", "sayur", "lainnya"],
    },
  },
  required: ["kaloriPer100g", "kategori"],
};

export async function estimateFoodCalories(namaMakanan: string) {
  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction: "Kamu adalah asisten estimasi nilai gizi makanan Indonesia.",
    generationConfig: { responseMimeType: "application/json", responseSchema: foodEstimationSchema },
  });

  const result = await model.generateContent(`Estimasi kalori per 100 gram untuk: ${namaMakanan}`);
  const parsed = JSON.parse(result.response.text());

  // WAJIB validasi rentang wajar — jangan percaya angka mentah dari AI begitu saja.
  if (parsed.kaloriPer100g < 0 || parsed.kaloriPer100g > 900) {
    return { kaloriPer100g: 150, kategori: "lainnya" as const }; // fallback default generik
  }
  return parsed;
}
```

`responseSchema` menjamin **bentuk** JSON benar, tapi tidak menjamin **nilai**-nya masuk akal (`enum` schema Gemini juga tidak bisa menyatakan rentang angka) — validasi rentang tetap wajib di kode, ini bagian dari mitigasi hallucination yang dicatat di `bugarin_schema_notes.md`.

## Anti-Patterns

| Anti-Pattern | Risiko | Perbaikan |
|---|---|---|
| Minta JSON lewat instruksi prompt teks saja, tanpa `responseSchema` | Output bisa dibungkus markdown/teks pembuka, `JSON.parse` gagal | Selalu set `responseMimeType` + `responseSchema` |
| Percaya penuh angka numerik dari AI tanpa validasi rentang | Data gizi/kalori absurd tersimpan ke `master_makanan` | Validasi rentang + fallback default (lihat Pola 3) |
| Minta AI generate ulang data yang sudah pasti ada di DB (lokasi gym, nama PT) | Risiko hallucination di data yang seharusnya tidak pernah salah | Sisipkan data pasti di backend setelah response AI diterima |
| Panggil Gemini API langsung dari Mobile/Web | Melanggar requirement kampus (backend-driven AI), API key ikut terekspos ke klien | Semua panggilan lewat modul `ai/` di backend |
| Tidak menyimpan `systemInstruction` yang konsisten antar pemanggilan fungsi yang sama | Output AI jadi tidak konsisten gaya/batasannya | Definisikan `systemInstruction` sekali per fungsi, jangan diketik ulang tiap panggilan |

## Related

- Skill: `drizzle-mysql-patterns` — pola get-or-create `master_makanan` yang memanggil Pola 3 di atas
- Skill: `context7-docs-lookup` — cek update API `@google/generative-ai` sebelum implementasi
- Dokumen: `Bugarin_PRD_Backend_AI.md` bab 6 — desain Role/Constraint/Output Schema lengkap per fungsi AI
