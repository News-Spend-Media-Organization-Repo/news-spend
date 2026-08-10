import type { Payload, PayloadRequest } from "payload";

/**
 * Which moderation emails an admin receives.
 *
 * Stored per-admin on the `admins` collection. When unset, the admin's role
 * decides (see DEFAULT_ALERT_ROLES), so a fresh install still notifies someone
 * without anyone having to configure it.
 */
export type AlertPreference = "all" | "urgent" | "digest" | "none";

export type AlertTier = "urgent" | "digest";

/** Roles that receive moderation email when they have no explicit preference. */
export const DEFAULT_ALERT_ROLES = new Set(["super-admin", "content-manager"]);

/**
 * Roles never mailed moderation content, even if explicitly opted in.
 * Partners are external parties; reports quote user content and identify
 * reporters, which is not theirs to see.
 */
const EXCLUDED_ROLES = new Set(["partner"]);

export type AdminRecord = {
  email?: string | null;
  role?: string | null;
  moderationAlerts?: AlertPreference | null;
};

/**
 * Resolves which of the given admins should receive a given tier of alert.
 *
 * Pure so the routing rules can be tested without a database. `extraEmails`
 * carries addresses from MODERATION_ALERT_EMAILS — on-call or shared inboxes
 * that aren't admin accounts.
 */
export function selectRecipients(
  admins: AdminRecord[],
  tier: AlertTier,
  extraEmails: string[] = []
): string[] {
  const selected: string[] = [];

  for (const admin of admins) {
    if (!admin.email) {
      continue;
    }

    const role = admin.role ?? "";
    if (EXCLUDED_ROLES.has(role)) {
      continue;
    }

    const preference: AlertPreference =
      admin.moderationAlerts ??
      (DEFAULT_ALERT_ROLES.has(role) ? "all" : "none");

    if (preference === "all" || preference === tier) {
      selected.push(admin.email);
    }
  }

  selected.push(...extraEmails);

  // Case-insensitive dedupe, preserving the first spelling seen.
  const seen = new Set<string>();
  return selected.filter((email) => {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Parses the MODERATION_ALERT_EMAILS env var (comma-separated). */
export function parseExtraEmails(raw = process.env.MODERATION_ALERT_EMAILS) {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

/**
 * Loads admins and resolves the recipient list for a tier.
 *
 * Logs loudly when the list is empty: previously both mail paths returned
 * "not sent" silently, which is indistinguishable from "nothing to report"
 * and would hide a total moderation-notification outage.
 */
export async function resolveModerationRecipients(
  payload: Payload,
  tier: AlertTier,
  req?: PayloadRequest
): Promise<string[]> {
  const admins = await payload.find({
    collection: "admins",
    depth: 0,
    pagination: false,
    req,
  });

  const recipients = selectRecipients(
    admins.docs as AdminRecord[],
    tier,
    parseExtraEmails()
  );

  if (recipients.length === 0) {
    payload.logger.error(
      { tier, adminCount: admins.docs.length },
      "No moderation alert recipients resolved — moderation email will not be delivered. Set an admin's Moderation Alerts preference or MODERATION_ALERT_EMAILS."
    );
  }

  return recipients;
}
