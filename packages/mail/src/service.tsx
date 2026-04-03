import logger from "@news-spend-media/logger";
import { AccountDeletedEmail } from "@news-spend-media/transactional/emails/account-deleted";
import NewsSpendVerificationEmail from "@news-spend-media/transactional/emails/accountOtpVerification";
import { ForgotPasswordEmail } from "@news-spend-media/transactional/emails/forgot-password";
import { WelcomeEmail } from "@news-spend-media/transactional/emails/welcome";
import { render } from "@react-email/render";
import React from "react";

import { DEFAULT_FROM_EMAIL, resend } from "./client";

export async function sendOTPVerificationEmail(to: string, otp: string) {
  try {
    const html = await render(<NewsSpendVerificationEmail otp={otp} />);

    await resend.emails.send({
      from: DEFAULT_FROM_EMAIL,
      to,
      subject: "Verify your News Spend Media account",
      html,
    });
    logger.info({ to }, "OTP verification email sent successfully");
  } catch (error) {
    logger.error({ error, to }, "Failed to send OTP verification email");
    throw error;
  }
}

export async function sendWelcomeEmail(to: string, username: string) {
  try {
    const html = await render(<WelcomeEmail username={username} />);
    await resend.emails.send({
      from: DEFAULT_FROM_EMAIL,
      to,
      subject: "Welcome to News-Spend Media – Where Dreams Come to Life!",
      html,
      scheduledAt: "in 1 min",
    });
    logger.info({ to }, "Welcome email sent successfully");
  } catch (error) {
    logger.error({ error, to }, "Failed to send welcome email");
  }
}

export async function sendPasswordResetEmail(token: string, email: string) {
  try {
    const resetLink = `${process.env.APP_URL}/change-password/${token}`;
    const html = await render(<ForgotPasswordEmail resetLink={resetLink} />);

    await resend.emails.send({
      from: DEFAULT_FROM_EMAIL,
      to: email,
      subject: "Reset Your Password",
      html,
    });
    logger.info({ email }, "Password reset email sent successfully");
  } catch (error) {
    console.error({ error, email });
    logger.error({ error, email }, "Failed to send password reset email");
  }
}

export async function sendAccountDeletedEmail(to: string, username: string) {
  try {
    const html = await render(<AccountDeletedEmail username={username} />);
    await resend.emails.send({
      from: DEFAULT_FROM_EMAIL,
      to,
      subject: "Your News-Spend Media Account Has Been Deleted",
      html,
    });
    logger.info(
      { to },
      "Account deletion confirmation email sent successfully"
    );
  } catch (error) {
    logger.error({ error, to }, "Failed to send account deletion email");
  }
}
