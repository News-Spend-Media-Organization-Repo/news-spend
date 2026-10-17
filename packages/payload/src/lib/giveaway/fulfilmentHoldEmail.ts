import { escapeHtml } from "../email/macros";

export type FulfilmentHoldEmailInput = {
  winnerName?: string | null;
  prizeName: string;
  amount?: number | null;
  reason: string;
  attemptReference?: string | null;
  adminUrl: string;
};

const CELL = "padding: 6px 12px 6px 0; vertical-align: top;";

function row(label: string, value: string): string {
  return `<tr><td style="${CELL} color: #666;">${label}</td><td style="${CELL}">${value}</td></tr>`;
}

/**
 * The email an administrator gets when a payout is held.
 *
 * Unlike the winner's copy, this one repeats the provider's own wording,
 * because that is written for the person who can act on it. `reason` carries
 * that text — including operator names read out of Reloadly's catalogue — and
 * it is untrusted, so every interpolated value is escaped before it reaches
 * this HTML body.
 */
export function fulfilmentHoldEmail(input: FulfilmentHoldEmailInput): {
  subject: string;
  html: string;
} {
  const { winnerName, prizeName, amount, reason, attemptReference, adminUrl } =
    input;

  // Omitted, not blank: an absent amount or reference must never print as
  // "null" to the person reading this.
  const rows = [
    winnerName ? row("Winner", escapeHtml(winnerName)) : "",
    row("Prize", escapeHtml(prizeName)),
    amount == null ? "" : row("Amount", escapeHtml(String(amount))),
    row("Reason", escapeHtml(reason)),
    attemptReference ? row("Reference", escapeHtml(attemptReference)) : "",
  ].filter(Boolean);

  const html = `<div style="font-family: system-ui, sans-serif; max-width: 520px;">
  <h2 style="color: #b3261e;">A payout is on hold</h2>
  <p style="color: #666;">This prize stays held until someone clears it. The record below has the detail.</p>
  <table style="border-collapse: collapse;">
${rows.join("\n")}
  </table>
  <p><a href="${escapeHtml(adminUrl)}" style="color: #1a73e8;">Open the winner's record</a></p>
</div>`;

  return { subject: `A giveaway payout is on hold: ${prizeName}`, html };
}
