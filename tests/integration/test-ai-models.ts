import { generateWeeklyPlan } from "../../src/modules/ai/weekly-plan";
import { generateRealtimeFeedback } from "../../src/modules/ai/feedback";
import { estimateFoodCalories } from "../../src/modules/ai/food-estimation";

async function runAITests() {
  console.log("=== STARTING AI END-TO-END TESTS (gemini-flash-latest) ===");

  try {
    // 1. Test generateWeeklyPlan
    console.log("\n1. Testing generateWeeklyPlan...");
    const plan = await generateWeeklyPlan({
      tinggiBadanCm: 170,
      alergiMakanan: "Kacang",
      bbAwalKg: 80,
      bbSekarangKg: 78,
      bbTujuanKg: 70,
      tujuan: "turun_bb",
      tempatGym: "Gym XYZ"
    });
    console.log("-> Success! Workout plan size:", plan.workoutPlan.length);
    console.log("-> Meal plan size:", plan.mealPlan.length);
    console.log("-> Type of plan.workoutPlan[0]:", typeof plan.workoutPlan[0]);
    console.log("-> Example workout:", plan.workoutPlan[0]);
  } catch (err: any) {
    console.error("-> Failed generateWeeklyPlan:", err.message);
  }

  try {
    // 2. Test generateRealtimeFeedback
    console.log("\n2. Testing generateRealtimeFeedback...");
    const feedback = await generateRealtimeFeedback("Klien A baru saja mencatat berat badan turun 1 kg minggu ini.");
    console.log("-> Success! Feedback:", feedback);
  } catch (err: any) {
    console.error("-> Failed generateRealtimeFeedback:", err.message);
  }

  try {
    // 3. Test estimateFoodCalories
    console.log("\n3. Testing estimateFoodCalories...");
    const est = await estimateFoodCalories("Nasi Goreng Spesial");
    console.log("-> Success! Estimasi:", est);
    console.log("-> Type of kaloriPer100g:", typeof est.kaloriPer100g);
  } catch (err: any) {
    console.error("-> Failed estimateFoodCalories:", err.message);
  }

  console.log("\n=== AI TESTS FINISHED ===");
}

runAITests();
