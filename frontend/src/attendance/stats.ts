/**
 * How many sessions in a row a student must attend to reach the threshold.
 *
 * They've attended `attended` of `counted` sessions. After n more attended sessions:
 *   (attended + n) / (counted + n) >= threshold / 100
 *   n >= (threshold * counted - 100 * attended) / (100 - threshold)
 * Whole-number maths throughout, so the answer is exact.
 *
 * Returns 0 if already at or above the threshold, and null if it can't be reached
 * (a 100% threshold after any absence).
 */
export function sessionsNeeded(
  attended: number,
  counted: number,
  threshold: number,
): number | null {
  const shortfall = threshold * counted - 100 * attended
  if (shortfall <= 0) return 0
  if (threshold >= 100) return null
  return Math.ceil(shortfall / (100 - threshold))
}

/** "74.9%", or "No data yet" when nothing counts. */
export function percentageText(percentage: number | null): string {
  return percentage === null ? 'No data yet' : `${percentage.toFixed(1)}%`
}
