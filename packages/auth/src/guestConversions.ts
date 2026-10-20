import { randomUUID } from "node:crypto";

import logger from "@news-spend-media/logger";

type Queryable = {
  query: (text: string, values: unknown[]) => Promise<unknown>;
};

type LinkAccountData = {
  anonymousUser: { user: { id: string; createdAt: Date | string } };
  newUser: { user: { id: string } };
};

/**
 * Record that a guest account became a registered one.
 *
 * Better Auth deletes the guest user immediately after this hook, so the guest
 * id and creation time are only available here. A failure to record must never
 * fail the sign-in that triggered it.
 */
export async function recordGuestConversion(
  db: Queryable,
  { anonymousUser, newUser }: LinkAccountData
): Promise<void> {
  try {
    const convertedAt = new Date();
    await db.query(
      `INSERT INTO guest_conversions
         (id, anonymous_user_id, user_id, guest_created_at, converted_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (anonymous_user_id, user_id) DO NOTHING`,
      [
        randomUUID(),
        anonymousUser.user.id,
        newUser.user.id,
        anonymousUser.user.createdAt,
        convertedAt,
        convertedAt,
      ]
    );
  } catch (error) {
    logger.error({ err: error }, "Failed to record guest conversion");
  }
}
