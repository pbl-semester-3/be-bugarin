export function calculateTargetKalori(
  beratBadanKg: number,
  tinggiBadanCm: number,
  usia: number,
  jenisKelamin: "pria" | "wanita",
  tujuan: "turun_bb" | "naik_bb"
): number {
  const bmr =
    jenisKelamin === "pria"
      ? 10 * beratBadanKg + 6.25 * tinggiBadanCm - 5 * usia + 5
      : 10 * beratBadanKg + 6.25 * tinggiBadanCm - 5 * usia - 161;

  const tdee = bmr * 1.4;

  let targetKalori = tujuan === "turun_bb" ? tdee - 500 : tdee + 500;

  if (targetKalori < 1200) {
    targetKalori = 1200;
  }

  return Math.round(targetKalori);
}
