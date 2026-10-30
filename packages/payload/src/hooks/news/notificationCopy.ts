/** Push limits, matching the giveaway body limit that keeps text on a lock screen. */
export const NEWS_NOTIFICATION_TITLE_MAX_LENGTH = 120;
export const NEWS_NOTIFICATION_BODY_MAX_LENGTH = 150;

export type NewsNotificationSource = {
  title: string;
  type?: string | null;
  excerpt?: string | null;
  sendNotification?: boolean | null;
  notificationTitle?: string | null;
  notificationBody?: string | null;
};

/**
 * The push copy for a newly published article, or null when the editor
 * switched the notification off. Blank overrides fall back to the article, so
 * articles written before these fields existed keep sending.
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
      ? doc.excerpt
        ? `${doc.excerpt}...`
        : "New news published!"
      : "New video news published!");

  return {
    title: doc.notificationTitle?.trim() || doc.title,
    body,
  };
}
