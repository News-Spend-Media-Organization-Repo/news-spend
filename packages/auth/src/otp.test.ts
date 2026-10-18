import { describe, expect, test } from "bun:test";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins";

import {
  generateOTPForRequest,
  LEGACY_OTP_LENGTH,
  OTP_LENGTH,
  OTP_LENGTH_HEADER,
  otpLengthFor,
} from "./otp";

const headers = (value?: string) =>
  new Headers(value === undefined ? {} : { [OTP_LENGTH_HEADER]: value });

describe("otpLengthFor", () => {
  test("builds that send no header get the four digits they can enter", () => {
    expect(otpLengthFor(headers())).toBe(LEGACY_OTP_LENGTH);
    expect(otpLengthFor(undefined)).toBe(LEGACY_OTP_LENGTH);
  });

  test("builds that ask for six get six", () => {
    expect(otpLengthFor(headers("6"))).toBe(OTP_LENGTH);
    expect(otpLengthFor(headers(" 6 "))).toBe(OTP_LENGTH);
  });

  test("an unsupported or garbled length falls back to four", () => {
    for (const value of ["1", "0", "-6", "8", "6.5", "six", ""]) {
      expect(otpLengthFor(headers(value))).toBe(LEGACY_OTP_LENGTH);
    }
  });
});

describe("generateOTPForRequest", () => {
  test("returns digits only, at the caller's length", () => {
    expect(generateOTPForRequest({}, { headers: headers("6") })).toMatch(
      /^\d{6}$/
    );
    expect(generateOTPForRequest({}, { headers: headers() })).toMatch(
      /^\d{4}$/
    );
    expect(generateOTPForRequest({})).toMatch(/^\d{4}$/);
  });
});

/**
 * Through better-auth itself, so the test fails if a better-auth upgrade
 * stops handing `generateOTP` the request context.
 */
describe("emailOTP wired with generateOTPForRequest", () => {
  const sent: string[] = [];
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test-secret-that-is-long-enough-to-pass-checks",
    // sendVerificationOTP silently skips unknown emails, so seed a reader.
    database: memoryAdapter({
      user: [
        {
          id: "user-1",
          email: "reader@example.com",
          name: "Reader",
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      verification: [],
    }),
    plugins: [
      emailOTP({
        otpLength: LEGACY_OTP_LENGTH,
        generateOTP: generateOTPForRequest,
        async sendVerificationOTP({ otp }) {
          sent.push(otp);
        },
      }),
    ],
  });

  const send = async (requestHeaders: Headers) => {
    await auth.api.sendVerificationOTP({
      body: { email: "reader@example.com", type: "email-verification" },
      headers: requestHeaders,
    });
    return sent.at(-1);
  };

  test("an old build is emailed a four-digit code", async () => {
    expect(await send(headers())).toMatch(/^\d{4}$/);
  });

  test("a new build is emailed a six-digit code", async () => {
    expect(await send(headers("6"))).toMatch(/^\d{6}$/);
  });
});
