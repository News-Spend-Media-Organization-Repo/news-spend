/**
 * The most one activity may pay, in Dream Points. News articles and partner
 * promotions are editor-entered, so this is a ceiling against a typo or a
 * hostile edit, enforced when the record is saved and again when it awards.
 */
export const MAX_ACTIVITY_POINTS = 5000;

/**
 * A server-decided award, or null when the value cannot be paid.
 *
 * Missing and null count as 0, which is how an article without points has
 * always behaved. Anything that is not a finite number in 0..ceiling is
 * refused rather than coerced.
 */
export function activityPoints(value: unknown): number | null {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || value > MAX_ACTIVITY_POINTS) {
    return null;
  }
  return value;
}
