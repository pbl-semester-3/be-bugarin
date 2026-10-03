// Helper kanonik "awal minggu" untuk seluruh project (klien, PT, cron job).
// Minggu selalu dimulai hari Senin dan dihitung dalam UTC, konsisten dengan konvensi
// "hari ini" project (new Date().toISOString().slice(0, 10)).
//
// Jangan menulis ulang perhitungan Senin di tempat lain — pakai helper ini agar
// writer (insert weekly_plans) dan reader (weekly-plan/current, dashboard) selalu cocok.

export function getStartOfWeekUtc(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Minggu = 0 -> 7, Senin = 1
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

export function getMondayOfDateStringUtc(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return getStartOfWeekUtc(new Date(Date.UTC(year, month - 1, day)));
}
