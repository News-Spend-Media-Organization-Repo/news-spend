type Queryable = {
  query: (text: string, values: unknown[]) => Promise<unknown>;
};

/**
 * Delete the push token a device registered for the account that is signing
 * out.
 *
 * The owner comes from the session being ended, never from the request body:
 * the body is the caller's to write, so trusting a `userId` there let anyone
 * holding a session delete another account's token. Scoped by user_id as well
 * as token, because the same device signing into a new account reassigns the
 * row to the new user (see createPushToken), and an unscoped delete could wipe
 * the new account's freshly registered token.
 */
export async function removeSignedOutPushToken(
  db: Queryable,
  sessionUserId: string | undefined,
  pushToken: unknown
): Promise<boolean> {
  if (!sessionUserId || typeof pushToken !== "string" || !pushToken) {
    return false;
  }
  await db.query("DELETE FROM push_tokens WHERE token = $1 AND user_id = $2", [
    pushToken,
    sessionUserId,
  ]);
  return true;
}
