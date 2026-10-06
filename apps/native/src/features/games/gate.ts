import { findGame, GAMES_MIN_AGE } from "./catalog";

/**
 * Whole years old on `now`, from a date of birth the app stores as an ISO
 * instant at UTC midnight of the calendar date the person picked. The birthday
 * is read in UTC so it is the date they entered, and today in local time so a
 * birthday arrives when they would expect it.
 */
export function ageOn(
  dateOfBirth: string | Date,
  now = new Date()
): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return null;
  }
  let age = now.getFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getUTCMonth() ||
    (now.getMonth() === dob.getUTCMonth() && now.getDate() < dob.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

export type GameGate =
  /** The link names a game that is not on the list. */
  | "unknown-game"
  /** Games need an account, and a guest has none. */
  | "sign-in"
  /** Waiting on the account to learn the declared age. */
  | "loading"
  /** Signed in, but no date of birth on record yet. */
  | "need-birth-date"
  /** Declared age is below the minimum the app is rated for. */
  | "too-young"
  | "ok";

/**
 * Whether this person may play this game now (Guideline 4.7.5).
 *
 * Age is the declared date of birth, which is write-once in the app. The check
 * is by the app's rating, not per game: every game on the list was chosen to
 * suit it, so there is no game that is fine for 12-year-olds and not for 16.
 */
export function gateFor({
  namespace,
  isSignedIn,
  isGuest,
  me,
  now = new Date(),
}: {
  namespace: string | undefined;
  isSignedIn: boolean;
  isGuest: boolean;
  /** `undefined` while loading, `null` if it could not be read. */
  me: { dateOfBirth?: string | null } | null | undefined;
  now?: Date;
}): GameGate {
  if (!findGame(namespace)) {
    return "unknown-game";
  }
  if (!isSignedIn || isGuest) {
    return "sign-in";
  }
  if (me === undefined) {
    return "loading";
  }
  if (!me?.dateOfBirth) {
    return "need-birth-date";
  }
  const age = ageOn(me.dateOfBirth, now);
  if (age === null) {
    return "need-birth-date";
  }
  return age >= GAMES_MIN_AGE ? "ok" : "too-young";
}
