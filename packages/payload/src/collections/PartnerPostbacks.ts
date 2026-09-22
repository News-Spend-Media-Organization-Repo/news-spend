import type { CollectionConfig } from "payload";
import { isStaff } from "../access/adminRoles";

/**
 * What became of each conversion postback a partner sent us.
 *
 * A postback is how a partner tells us a reader completed their task, and
 * everything downstream (points, the giveaway's Featured Offer) hangs on it.
 * Until now the only trace of one that was refused was a log line, so a partner
 * whose signing had quietly broken looked exactly like a partner with no
 * conversions. This records the outcome so both sides can see it.
 *
 * Only postbacks that name a real click are recorded, because only those can be
 * attributed to a partner. The endpoint is public, so recording every request
 * would let anyone fill this table; and the unique key below allows one row per
 * click and outcome, so the table can never grow beyond a few rows per click the
 * server itself issued, whatever is sent at it.
 *
 * Written by the API server, never over REST, and readable by staff only. A
 * partner sees the summary through the analytics screens, not these rows.
 */
const PartnerPostbacks: CollectionConfig = {
  slug: "partner-postbacks",
  access: {
    read: isStaff,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: "outcome",
    group: "Partners",
    defaultColumns: ["partner", "outcome", "reason", "receivedAt"],
  },
  indexes: [
    // One row per click and outcome: a retried postback does not add rows.
    { fields: ["clickId", "outcome"], unique: true },
  ],
  fields: [
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      required: true,
      index: true,
    },
    {
      name: "clickId",
      type: "text",
      required: true,
    },
    {
      name: "outcome",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Accepted", value: "accepted" },
        { label: "Partner reported a failure", value: "failed_reported" },
        { label: "Already processed", value: "duplicate" },
        { label: "Rejected: could not be verified", value: "rejected" },
      ],
    },
    {
      name: "reason",
      type: "text",
      admin: {
        description:
          "Why it was rejected, from our own verification. Empty for the other outcomes.",
      },
    },
    {
      name: "receivedAt",
      type: "date",
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
    },
  ],
};

export default PartnerPostbacks;
