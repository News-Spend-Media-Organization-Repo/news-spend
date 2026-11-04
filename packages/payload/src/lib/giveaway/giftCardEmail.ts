import type { BasePayload } from "payload";

import { escapeHtml } from "../email/macros";

export type GiftCardEmailInput = {
  winnerName?: string | null;
  prizeName: string;
  code: string;
  pin?: string | null;
  redemptionUrl?: string | null;
  instructions?: string | null;
};

const CELL = "padding: 6px 12px 6px 0; vertical-align: top;";

function row(label: string, value: string): string {
  return `<tr><td style="${CELL} color: #666;">${label}</td><td style="${CELL}">${value}</td></tr>`;
}

/**
 * The email a winner gets once their gift card code is stored.
 *
 * Every interpolated value is escaped, exactly like the held-payout copy: the
 * instructions are Reloadly's own wording, and that is untrusted.
 */
export function giftCardEmail(input: GiftCardEmailInput): {
  subject: string;
  html: string;
} {
  const { winnerName, prizeName, code, pin, redemptionUrl, instructions } =
    input;

  // Omitted, not blank: an absent name, PIN or URL must never print "null".
  const rows = [
    winnerName ? row("For", escapeHtml(winnerName)) : "",
    row("Gift card", escapeHtml(prizeName)),
    row("Card number", escapeHtml(code)),
    pin ? row("PIN", escapeHtml(pin)) : "",
    redemptionUrl ? row("Redeem at", escapeHtml(redemptionUrl)) : "",
  ].filter(Boolean);

  const html = `<div style="font-family: system-ui, sans-serif; max-width: 520px;">
  <h2 style="color: #1a73e8;">Your gift card is ready</h2>
  <p style="color: #333;">Congratulations — your prize has been fulfilled. Here is your gift card.</p>
  <table style="border-collapse: collapse;">
${rows.join("\n")}
  </table>
${instructions ? `<p style="color: #666;">${escapeHtml(instructions)}</p>` : ""}
  <p style="color: #666;">This code is personal to you and cannot be replaced. Keep it safe.</p>
</div>`;

  return { subject: `Your ${prizeName} gift card is ready`, html };
}

/**
 * Email one winner their gift card code.
 *
 * NEVER THROWS: a mail server being unreachable must not undo a prize that was
 * already stored and marked fulfilled. `false` means the caller leaves
 * `giftCardEmailSentAt` empty while the prize stays fulfilled.
 */
export async function sendGiftCardEmail(
  payload: BasePayload,
  args: GiftCardEmailInput & { to: string }
): Promise<boolean> {
  const { to, ...input } = args;
  const { subject, html } = giftCardEmail(input);

  try {
    await payload.sendEmail({ to, subject, html });
    return true;
  } catch (error) {
    // The code is deliberately not logged; it is the secret the email carries.
    payload.logger.error(
      { err: error, to },
      "[giveaway] could not email a gift card code to its winner"
    );
    return false;
  }
}
