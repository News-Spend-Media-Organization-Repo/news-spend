import { randomUUID } from "node:crypto";

import logger from "@news-spend-media/logger";

type Queryable = {
  query: (text: string, values: unknown[]) => Promise<unknown>;
};

type GuestUser = {
  id: string;
  createdAt: Date | string;
  isAnonymous?: boolean | null;
};

type LinkAccountData = {
  anonymousUser: { user: GuestUser };
  newUser: { user: { id: string } };
};

const insertEvent = async (
  db: Queryable,
  kind: "created" | "converted",
  anonymousUserId: string,
  userId: string | null,
  guestCreatedAt: Date | string
): Promise<void> => {
  try {
    const occurredAt = new Date();
    await db.query(
      `INSERT INTO guest_events
         (id, kind, anonymous_user_id, user_id, guest_created_at, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [
        randomUUID(),
        kind,
        anonymousUserId,
        userId,
        guestCreatedAt,
        occurredAt,
        occurredAt,
      ]
    );
  } catch (error) {
    logger.error({ err: error, kind }, "Failed to record guest event");
  }
};

/**
 * Record that a guest account was created. Registered sign-ups write nothing.
 */
export async function recordGuestCreated(
  db: Queryable,
  user: GuestUser
): Promise<void> {
  if (user.isAnonymous !== true) {
    return;
  }
  await insertEvent(db, "created", user.id, null, user.createdAt);
}

/**
 * Record that a guest account became a registered one.
 *
 * Better Auth deletes the guest immediately after this hook, so the guest id
 * and creation time are only available here. A failure to record must never
 * fail the sign-in or sign-up that triggered it.
 */
export async function recordGuestConversion(
  db: Queryable,
  { anonymousUser, newUser }: LinkAccountData
): Promise<void> {
  await insertEvent(
    db,
    "converted",
    anonymousUser.user.id,
    newUser.user.id,
    anonymousUser.user.createdAt
  );
}
