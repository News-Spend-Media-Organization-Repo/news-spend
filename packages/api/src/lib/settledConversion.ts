import type { BasePayload } from "payload";

/**
 * Whether this person has already been paid for this offer.
 *
 * One definition for both ways of earning from a partner ad, so "once per
 * person per offer" cannot drift between the tap path and the postback path.
 */
export async function hasSettledConversion(
  payload: BasePayload,
  { userId, contentId }: { userId: string; contentId: string }
): Promise<boolean> {
  const settled = await payload.count({
    collection: "partner-conversions",
    where: {
      and: [
        { user: { equals: userId } },
        { content: { equals: contentId } },
        { status: { in: ["converted", "awarded"] } },
      ],
    },
  });
  return settled.totalDocs > 0;
}
