import { generateRandomString } from "better-auth/crypto";

/**
 * How long an emailed code is, decided per request.
 *
 * Every app build up to 2.6.1 draws exactly four input boxes, and a
 * six-digit code typed into four boxes can never be submitted. So the server
 * cannot simply switch lengths: it has to keep sending four digits to the
 * builds that can only take four.
 *
 * The client says what it can take in a header, rather than the server
 * inferring it from `x-app-version`. The screen ships as an OTA update with
 * `runtimeVersion: appVersion`, so a 2.6.1 install with the update and a
 * 2.6.1 install without it report the same native version. The header is
 * sent by the same JavaScript that draws the boxes, so it can't disagree with
 * them.
 */

/** Header the app sends the code length its verification screen draws. */
export const OTP_LENGTH_HEADER = "x-otp-length";

/** What builds that send no header (every one shipped so far) can enter. */
export const LEGACY_OTP_LENGTH = 4;

/** The length new builds ask for. */
export const OTP_LENGTH = 6;

const SUPPORTED_LENGTHS: readonly number[] = [LEGACY_OTP_LENGTH, OTP_LENGTH];

/**
 * The length to send this caller. Anything other than a supported length
 * falls back to the legacy four, so a missing or garbled header costs the
 * caller nothing, and nobody can ask for a one-digit code.
 */
export function otpLengthFor(headers: Headers | null | undefined): number {
  const requested = Number(headers?.get(OTP_LENGTH_HEADER)?.trim());
  return SUPPORTED_LENGTHS.includes(requested) ? requested : LEGACY_OTP_LENGTH;
}

/** `emailOTP`'s `generateOTP`: a random numeric code of the caller's length. */
export function generateOTPForRequest(
  _data: unknown,
  ctx?: { headers?: Headers | undefined }
): string {
  return generateRandomString(otpLengthFor(ctx?.headers), "0-9");
}
