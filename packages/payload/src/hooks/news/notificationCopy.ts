/** Push limits, matching the giveaway body limit that keeps text on a lock screen. */
export const NEWS_NOTIFICATION_TITLE_MAX_LENGTH = 120;
export const NEWS_NOTIFICATION_BODY_MAX_LENGTH = 150;

type KeyPoints = { point?: string | null }[] | null;

export type NewsNotificationSource = {
  title: string;
  type?: string | null;
  keyPoints?: KeyPoints;
  sendNotification?: boolean | null;
  notificationKicker?: string | null;
  notificationTitle?: string | null;
  notificationBody?: string | null;
};

/** The first key point an editor actually wrote, or null when there is none. */
export function firstKeyPoint(doc: { keyPoints?: KeyPoints }): string | null {
  for (const entry of doc.keyPoints ?? []) {
    const point = entry?.point?.trim();
    if (point) {
      return point;
    }
  }
  return null;
}

/** Fits text into a push field, cutting at a word and ending with an ellipsis. */
export function truncateForPush(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) {
    return flat;
  }
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const atWord = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${atWord.trimEnd()}…`;
}

/**
 * What a push says before an editor touches it: the headline, and the article's
 * first key point as the body (empty when there is none).
 *
 * This is the one place that decides the default push copy. When summaries are
 * generated, change it here and the prefill, the fallback and the tests follow.
 */
export function suggestedNotificationCopy(doc: {
  title?: string | null;
  keyPoints?: KeyPoints;
}): { title: string; body: string } {
  const point = firstKeyPoint(doc);
  return {
    title: truncateForPush(doc.title ?? "", NEWS_NOTIFICATION_TITLE_MAX_LENGTH),
    body: point
      ? truncateForPush(point, NEWS_NOTIFICATION_BODY_MAX_LENGTH)
      : "",
  };
}

/**
 * The push copy for a newly published article, or null when the editor
 * switched the notification off. Blank fields fall back to the article, so
 * articles that were never prefilled still send.
 */
export function newsNotificationCopy(doc: NewsNotificationSource): {
  title: string;
  body: string;
} | null {
  if (doc.sendNotification === false) {
    return null;
  }

  const body =
    doc.notificationBody?.trim() ||
    (doc.type === "article"
      ? suggestedNotificationCopy(doc).body || "New news published!"
      : "New video news published!");

  const title = doc.notificationTitle?.trim() || doc.title;

  return {
    // The prefix is typed without punctuation, so "JUST IN:" and "JUST IN"
    // send the same title. A prefix plus a long headline can pass the limit,
    // and then the headline is cut rather than the push failing to send.
    title: truncateForPush(
      withKicker(title, doc.notificationKicker),
      NEWS_NOTIFICATION_TITLE_MAX_LENGTH
    ),
    body,
  };
}

const TRAILING_COLONS = /:+\s*$/;

/** "JUST IN" + "Headline" → "JUST IN: Headline"; no kicker leaves the title. */
function withKicker(title: string, kicker: string | null | undefined): string {
  const label = kicker?.trim().replace(TRAILING_COLONS, "");
  return label ? `${label}: ${title}` : title;
}
