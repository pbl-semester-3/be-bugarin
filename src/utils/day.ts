// Normalisasi nama hari & jam agar output seragam walau sumber (AI/override) tidak konsisten.
// Dipakai untuk menyusun jadwal gabungan di Dashboard PT (sorting + format respons).

export const DAY_ORDER = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

const DAY_ALIASES: Record<string, string> = {
  senin: "Senin",
  selasa: "Selasa",
  rabu: "Rabu",
  kamis: "Kamis",
  jumat: "Jumat",
  "jum'at": "Jumat",
  sabtu: "Sabtu",
  minggu: "Minggu",
  ahad: "Minggu",
  monday: "Senin",
  tuesday: "Selasa",
  wednesday: "Rabu",
  thursday: "Kamis",
  friday: "Jumat",
  saturday: "Sabtu",
  sunday: "Minggu",
};

export function normalizeHari(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  return DAY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function getDayOrder(hari: string): number {
  const idx = DAY_ORDER.indexOf(normalizeHari(hari));
  return idx === -1 ? DAY_ORDER.length : idx;
}

// Target format: HH:MM (24 jam, zero-padded). Menerima "9:00", "9.00", "16", "16:5", "16:00:00".
// Jika tidak bisa diparse (mis. "4 PM"), kembalikan nilai asli agar tidak crash/merusak data.
export function normalizeJam(raw: string): string {
  const original = String(raw ?? "").trim();
  const cleaned = original.replace(/\./g, ":");
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/);
  if (!match) return original;

  const hh = Number(match[1]);
  const mm = match[2] !== undefined ? Number(match[2]) : 0;
  if (hh > 23 || mm > 59) return original;

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
