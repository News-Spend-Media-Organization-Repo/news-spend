import { DEFAULT_FROM_EMAIL, resend } from "@news-spend-media/mail";
import type { TaskConfig } from "payload";
import { getPayload } from "../lib/getPayload";

/**
 * Payload job task: sendModerationDigest
 *
 * Daily digest email for content reports. Runs via cron (configured in
 * configurePayload.ts → jobs.autoRun). Queries all pending ContentReports
 * from the last 24 hours and sends a single summary email to every admin
 * in the "admins" collection.
 */
export const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

export const sendModerationDigestTask = {
  slug: "sendModerationDigest",
  retries: 1,
  handler: async ({ req }) => {
    const payload = await getPayload();

    const [reportsResult, adminsResult] = await Promise.all([
      payload.find({
        collection: "contentReports",
        where: {
          createdAt: {
            greater_than_equal: new Date(
              Date.now() - DIGEST_WINDOW_MS
            ).toISOString(),
          },
          status: { equals: "pending" },
        },
        sort: "-createdAt",
        depth: 0,
        pagination: false,
        req,
      }),
      payload.find({
        collection: "admins",
        depth: 0,
        pagination: false,
        req,
      }),
    ]);

    const reports = reportsResult.docs;
    const admins = adminsResult.docs as Array<{
      email: string;
      fullName?: string;
    }>;

    if (reports.length === 0 || admins.length === 0) {
      return { output: { sent: false } };
    }

    const adminEmails = admins
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));

    if (adminEmails.length === 0) {
      return { output: { sent: false } };
    }

    const serverUrl =
      process.env.PAYLOAD_PUBLIC_SERVER_URL ?? process.env.APP_URL ?? "";

    // Categorize reports
    let blocks = 0;

    const blockDetails: Array<{ by: string; blocked: string }> = [];
    const contentFlags: Array<{
      reason: string;
      relationTo: string;
      value: string;
    }> = [];

    const reasonLabels: Record<string, string> = {
      spam: "Spam or Advertising",
      harassment: "Harassment or Bullying",
      "hate-speech": "Hate Speech or Discrimination",
      misinformation: "Misinformation",
      "personal-info": "Personal Information",
      inappropriate: "Explicit or Inappropriate Content",
      "off-topic": "Off-Topic",
      trolling: "Trolling or Deliberate Provocation",
      illegal: "Illegal Activity",
      other: "Other",
    };

    for (const doc of reports) {
      const details = (doc as unknown as { additionalDetails?: string | null })
        .additionalDetails;
      const reportedItem = (
        doc as unknown as {
          reportedItem?: {
            relationTo: string;
            value: string;
          } | null;
        }
      ).reportedItem;
      const reason = (doc as unknown as { reason?: string }).reason;

      if (details?.includes("blocked by user")) {
        blocks++;
        const match = details.match(/User (\S+) blocked by user (\S+)/);
        if (match) {
          blockDetails.push({ by: match[2]!, blocked: match[1]! });
        }
      } else if (reportedItem?.relationTo && reportedItem?.value) {
        contentFlags.push({
          reason: reasonLabels[reason ?? "other"] ?? reason ?? "Other",
          relationTo: reportedItem.relationTo,
          value: reportedItem.value,
        });
      }
    }

    const now = new Date().toLocaleString("en-US", {
      timeZone: "Africa/Lagos",
    });

    let blockList = "";
    if (blockDetails.length > 0) {
      blockList =
        "<h3>Blocks</h3><ul>" +
        blockDetails
          .map((b) => `<li><strong>${b.by}</strong> blocked ${b.blocked}</li>`)
          .join("") +
        "</ul>";
    }

    let contentFlagList = "";
    if (contentFlags.length > 0) {
      contentFlagList =
        "<h3>Content Flags</h3><ul>" +
        contentFlags
          .map(
            (f) =>
              `<li><strong>${f.reason}</strong> — <a href="${serverUrl}/admin/collections/${f.relationTo}/${f.value}" style="color: #1a73e8;">View ${f.relationTo === "news" ? "News" : "Comment"}</a></li>`
          )
          .join("") +
        "</ul>";
    }

    const html = `<div style="font-family: system-ui, sans-serif; max-width: 520px;">
  <h2 style="color: #1a1a2e;">Moderation Digest</h2>
  <p style="color: #666;">Summary of activity in the last 24 hours (as of ${now}):</p>
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr>
      <td style="padding: 8px 0; color: #666;">Total reports</td>
      <td><strong>${reports.length}</strong></td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #666;">User blocks</td>
      <td><strong>${blocks}</strong></td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #666;">Content flags</td>
      <td><strong>${contentFlags.length}</strong></td>
    </tr>
  </table>
  ${blockList}
  ${contentFlagList}
  <p style="color: #666;">Review in the <strong>Content Reports</strong> section of the admin panel.</p>
</div>`;

    try {
      await resend.emails.send({
        from: DEFAULT_FROM_EMAIL,
        to: adminEmails,
        subject: `Moderation Digest — ${reports.length} report${reports.length > 1 ? "s" : ""} in the last 24 hours`,
        html,
      });

      req.payload.logger.info(
        {
          count: reports.length,
          blocks,
          contentFlags,
          recipients: adminEmails.length,
        },
        "Moderation digest email sent"
      );
    } catch (error) {
      req.payload.logger.error(
        { error },
        "Failed to send moderation digest email"
      );
      throw error;
    }

    return { output: { sent: true } };
  },
} as TaskConfig<"sendModerationDigest">;
