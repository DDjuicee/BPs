/** Drop everything after the second decimal. 99.286% displays as 99.28%. */
export function formatAccuracy(score: number, maxScore: number): string {
  if (maxScore <= 0) return "0.00%";
  const hundredths = Math.floor((score * 10000) / maxScore);
  const whole = Math.floor(hundredths / 100);
  const fraction = hundredths % 100;
  return `${whole}.${String(fraction).padStart(2, "0")}%`;
}
