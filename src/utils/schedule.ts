import { normalizeHari, normalizeJam } from "./day";

// Konvensi jadwal: durasi sesi 90 menit, jam wajar 06:00-21:00, Senin-Sabtu.
export const DEFAULT_DURATION_MIN = 90;
export const DAY_END_MIN = 21 * 60;

export type TimeRange = { start: number; end: number };

export type PlanItemLike = { hari: string; jam: string; jenis: string };

export type ConflictTipe = "antar_klien" | "dalam_plan";

export type ScheduleConflict = {
  proposedIndex: number;
  hari: string;
  jam: string;
  jenis: string;
  tipe: ConflictTipe;
  denganKlienId: number | null;
  denganNamaKlien: string | null;
  denganHari: string;
  denganJam: string;
  denganJenis: string;
};

const CANDIDATE_DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const CANDIDATE_STARTS = [6 * 60, 7 * 60 + 30, 9 * 60, 10 * 60 + 30, 13 * 60, 14 * 60 + 30, 16 * 60, 17 * 60 + 30, 19 * 60];

export function minutesToHHMM(minutes: number): string {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function formatRange(range: TimeRange): string {
  return `${minutesToHHMM(range.start)} - ${minutesToHHMM(range.end)}`;
}

function timeToMinutes(raw: string): number | null {
  const normalized = normalizeJam(raw);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

// Terima "17:00 - 18:00", "17.00-18.00", "17:00–18:00", "17:00 to 18:00", atau jam tunggal (-> +90 menit).
export function parseTimeRange(raw: string, durationMin = DEFAULT_DURATION_MIN): TimeRange | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const parts = text.split(/\s*(?:-|–|—|\bto\b|\bs\/d\b)\s*/i).filter(Boolean);
  const start = timeToMinutes(parts[0] ?? "");
  if (start === null) return null;

  const explicitEnd = parts.length > 1 ? timeToMinutes(parts[1] ?? "") : null;
  const end = explicitEnd !== null ? explicitEnd : start + durationMin;
  if (end <= start) return null;

  return { start, end };
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function hasTimeConflict(
  day: string,
  range: TimeRange,
  occupied: Array<{ hari: string; jam: string }>,
  durationMin = DEFAULT_DURATION_MIN,
): boolean {
  const normalizedDay = normalizeHari(day);
  return occupied.some((slot) => {
    if (normalizeHari(slot.hari) !== normalizedDay) return false;
    const other = parseTimeRange(slot.jam, durationMin);
    return other !== null && rangesOverlap(range, other);
  });
}

export function findConflicts(
  proposed: PlanItemLike[],
  otherPlans: Array<{ klienId: number; namaKlien: string; workoutPlan: PlanItemLike[] }>,
  durationMin = DEFAULT_DURATION_MIN,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  const normalized = proposed.map((item) => ({
    item,
    day: normalizeHari(item.hari),
    range: parseTimeRange(item.jam, durationMin),
  }));

  // Bentrok dalam satu plan: dua sesi dengan hari + waktu tumpang-tindih.
  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    if (!current.range) continue;
    for (let j = 0; j < i; j += 1) {
      const other = normalized[j];
      if (!other.range) continue;
      if (current.day === other.day && rangesOverlap(current.range, other.range)) {
        conflicts.push({
          proposedIndex: i,
          hari: current.item.hari,
          jam: current.item.jam,
          jenis: current.item.jenis,
          tipe: "dalam_plan",
          denganKlienId: null,
          denganNamaKlien: null,
          denganHari: other.item.hari,
          denganJam: other.item.jam,
          denganJenis: other.item.jenis,
        });
        break;
      }
    }
  }

  // Bentrok antar klien pada PT yang sama.
  normalized.forEach((current, index) => {
    if (!current.range) return;
    for (const plan of otherPlans) {
      for (const item of plan.workoutPlan) {
        if (normalizeHari(item.hari) !== current.day) continue;
        const other = parseTimeRange(item.jam, durationMin);
        if (!other || !rangesOverlap(current.range!, other)) continue;
        conflicts.push({
          proposedIndex: index,
          hari: current.item.hari,
          jam: current.item.jam,
          jenis: current.item.jenis,
          tipe: "antar_klien",
          denganKlienId: plan.klienId,
          denganNamaKlien: plan.namaKlien,
          denganHari: item.hari,
          denganJam: item.jam,
          denganJenis: item.jenis,
        });
      }
    }
  });

  return conflicts;
}

// Pilih slot 90 menit yang bebas (satu sesi per hari), divariasikan dengan `seed` (mis. klienId).
export function pickFreeSlots(
  occupied: Array<{ hari: string; jam: string }>,
  count: number,
  seed = 0,
  durationMin = DEFAULT_DURATION_MIN,
): Array<{ hari: string; jam: string }> {
  const chosen: Array<{ hari: string; jam: string }> = [];
  const dayOffset = ((seed % CANDIDATE_DAYS.length) + CANDIDATE_DAYS.length) % CANDIDATE_DAYS.length;
  const startOffset = ((seed % CANDIDATE_STARTS.length) + CANDIDATE_STARTS.length) % CANDIDATE_STARTS.length;
  const days = [...CANDIDATE_DAYS.slice(dayOffset), ...CANDIDATE_DAYS.slice(0, dayOffset)];
  const starts = [...CANDIDATE_STARTS.slice(startOffset), ...CANDIDATE_STARTS.slice(0, startOffset)];

  for (const day of days) {
    if (chosen.length >= count) break;
    for (const start of starts) {
      const range: TimeRange = { start, end: start + durationMin };
      if (range.end > DAY_END_MIN) continue;
      if (hasTimeConflict(day, range, [...occupied, ...chosen], durationMin)) continue;
      chosen.push({ hari: day, jam: formatRange(range) });
      break; // satu sesi per hari
    }
  }

  return chosen;
}
