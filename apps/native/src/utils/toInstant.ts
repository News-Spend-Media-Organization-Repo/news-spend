/** A trailing UTC designator or numeric offset: Z, +01:00, -0500, +01. */
const HAS_OFFSET = /(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * Reads a server timestamp as the UTC instant it names.
 *
 * Payload stores every timestamp in UTC and serialises it with `.toISOString()`,
 * so the usual string already ends in `Z` and this is a pass-through. The guard
 * is for the strings that reach us without an offset — a tz-unaware column, or a
 * value that lost its type on a round-trip through the persisted query cache.
 * `new Date()` reads those as device-local, which renders an hour early in
 * Nigeria (UTC+1) and wrong by the local offset everywhere else.
 *
 * Formatting the result stays the caller's job: date-fns renders in the device's
 * own timezone, which is what we want on every screen.
 */
export function toInstant(value: string | Date): Date {
  if (value instanceof Date) {
    return value;
  }

  const raw = value.trim();

  return new Date(HAS_OFFSET.test(raw) ? raw : `${raw}Z`);
}
