/**
 * Length of the emailed verification code this build's screen draws.
 *
 * The server sends four digits to any client that doesn't say otherwise,
 * because every build up to 2.6.1 draws exactly four boxes. This build says
 * six through `OTP_LENGTH_HEADER` on every auth request, so the code it is
 * emailed always fits the boxes it draws. Keep the two in step: the server
 * side is packages/auth/src/otp.ts.
 */
export const OTP_LENGTH = 6;

export const OTP_LENGTH_HEADER = "x-otp-length";
