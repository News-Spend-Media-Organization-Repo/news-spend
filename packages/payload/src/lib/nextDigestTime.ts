/**
 * Next occurrence of 23:00 Africa/Lagos, as a Date.
 *
 * Africa/Lagos is UTC+1 year-round (no DST), so 23:00 local is 22:00 UTC.
 * Shared by the report hook (which schedules the first digest) and the digest
 * task itself (which re-schedules while a backlog remains).
 */
export function nextDigestTime(from: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(from);

  const getPart = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  let target = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    22,
    0,
    0,
    0
  );

  if (target <= from.getTime()) {
    target += 24 * 60 * 60 * 1000;
  }

  return new Date(target);
}
