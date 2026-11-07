import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "./env";

export const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// Model Gemini untuk SEMUA fitur AI. `gemini-flash-latest` sempat 503 (high demand)
// sehingga SDK retry/backoff hingga >60s (timeout di Vercel). Default ke model flash
// terbaru yang stabil; bisa dioverride lewat env GEMINI_MODEL.
export const GEMINI_MODEL = env.GEMINI_MODEL ?? "gemini-3.8-flash";
