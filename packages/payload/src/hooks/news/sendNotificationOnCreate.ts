import type { CollectionAfterChangeHook } from "payload";

import { newsNotificationCopy } from "./notificationCopy";

/**
 * Fires when a news article is published for the first time.
 *
 * Creates a Notifications campaign document (status="sending") which triggers
 * the Notifications afterChange hook → expo-push-service.ts → delivery tracking,
 * receipt polling, and inbox entries, all via the new unified push system.
 *
 * The title and body come from the article's push fields when the editor filled
 * them in; otherwise they fall back to the article itself. The editor can also
 * switch the push off, and the article still records that it has been
 * published so a later edit does not send a late notification.
 */
const sendNotificationOnCreate: CollectionAfterChangeHook = async ({
  req,
  doc,
}) => {
  try {
    if (doc?._status !== "published" || doc.hasBeenPublished) {
      return doc;
    }

    const copy = newsNotificationCopy(doc);

    if (copy) {
      const notificationType: "news" | "breaking_news" =
        doc.type === "breaking_news" ? "breaking_news" : "news";

      await req.payload.create({
        collection: "notifications",
        data: {
          title: copy.title,
          body: copy.body,
          type: notificationType,
          deliveryAction: "send-now",
          targetType: "all",
          deviceTypes: ["all"],
          priority: "high",
          sound: true,
          _status: "published",
          data: {
            newsId: doc.id,
            type: doc.type,
            // Root-level `article/<slug>`, matching the News screen's linking path
            // (apps/native/src/navigation/shared-screens.tsx). This used to mint
            // the pre-refactor `news/article/<slug>`; detail screens moved to the
            // root stack in 1717c96d, so that form matched no route and a cold
            // start on the notification landed on NotFound. No video branch: the
            // `video` type is refused by News' beforeValidate hook, and
            // `live/video/<slug>` had no route at all.
            url: `article/${doc.slug}`,
          },
        },
        req,
      });
    }

    await req.payload.update({
      collection: "news",
      id: doc.id,
      data: { hasBeenPublished: true },
      req,
    });

    return doc;
  } catch (error) {
    req.payload.logger.error({
      msg: "sendNotificationOnCreate: failed to create notification",
      err: error,
      newsId: doc?.id,
    });
    return doc;
  }
};

export default sendNotificationOnCreate;
