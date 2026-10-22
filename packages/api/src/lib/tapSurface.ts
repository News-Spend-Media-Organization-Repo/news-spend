/**
 * Whether a tap that names no surface may still pay.
 *
 * Builds from before the app reported which surface a partner ad was tapped
 * on send none, so by default a surface-less tap is treated as it always was:
 * it pays when the item has any offer placement. That keeps old installs
 * earning, but it is also a hole, because a tap on an ad surface from such a
 * build is indistinguishable from an offer tap.
 *
 * Once every install reports its surface (the floor in `MIN_APP_VERSION`
 * guarantees it), set REQUIRE_TAP_SURFACE to close that hole without a
 * deploy. Off by default, like the app-version floor, so it can ship dark and
 * be turned on, and back off, as a pure configuration change.
 *
 * When on, a tap with no `surface` is recorded as coming from
 * `MISSING_TAP_SURFACE`, a surface that can never pay: nothing is awarded on
 * the tap, and the webhook ignores the partner's postback for it. Conversions
 * clicked BEFORE the switch was turned on keep their null surface and still
 * pay when the partner confirms, so tasks already in flight are not lost.
 */
export const MISSING_TAP_SURFACE = "unknown" as const;

export function requireTapSurface(): boolean {
  const raw = process.env.REQUIRE_TAP_SURFACE?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}
