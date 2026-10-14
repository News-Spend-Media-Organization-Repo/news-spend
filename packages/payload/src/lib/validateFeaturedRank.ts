import type { Payload } from "payload";

/** How many stories the app's trending carousel shows. */
export const CAROUSEL_SIZE = 3;

/**
 * Two live featured stories must not share a rank.
 *
 * A tie is broken by newest first, so a story "set to rank 2" that shares it
 * with an older one can end up nowhere near the front, and nothing says why.
 * Nine stories sat at rank 1 until this existed, which pushed everything else
 * off the carousel.
 *
 * "Live" means published and not past its end time: an expired story no longer
 * competes for a slot, so its rank is free to reuse. Returns `true` when the
 * rank is free, otherwise the message shown on the field.
 */
export async function validateFeaturedRank({
  value,
  featured,
  id,
  payload,
  now = new Date(),
}: {
  value: number | null | undefined;
  featured: boolean | null | undefined;
  id?: string | number | undefined;
  payload: Pick<Payload, "find">;
  now?: Date;
}): Promise<true | string> {
  if (!featured || value === null || value === undefined) {
    return true;
  }

  const { docs } = await payload.find({
    collection: "news",
    where: {
      and: [
        { featured: { equals: true } },
        { featuredRank: { equals: value } },
        { _status: { equals: "published" } },
        ...(id === undefined ? [] : [{ id: { not_equals: id } }]),
        {
          or: [
            { featuredUntil: { exists: false } },
            { featuredUntil: { greater_than: now.toISOString() } },
          ],
        },
      ],
    },
    limit: 1,
    depth: 0,
    pagination: false,
    select: { title: true },
  });

  const clash = docs[0];
  if (!clash) {
    return true;
  }

  return `Rank ${value} is already used by "${clash.title}". Pick a different rank, or unfeature that story first.`;
}
