import type { CollectionBeforeChangeHook } from "payload";

import { suggestedNotificationCopy } from "./notificationCopy";

/**
 * Fills the push title and body from the article until it is first published,
 * so the editor sees what will be sent and can change it.
 *
 * A field is refreshed while it is blank or still holds what this hook put
 * there on the previous save, so the push follows later edits to the headline
 * or the first key point. Once an editor changes a field it is theirs and is
 * left alone. After the first publish the push has been sent, so nothing here
 * runs. Articles with the push switched off are skipped.
 */
export const prefillNotificationCopy: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  if (!data || originalDoc?.hasBeenPublished) {
    return data;
  }
  if ((data.sendNotification ?? originalDoc?.sendNotification) === false) {
    return data;
  }
  const type = data.type ?? originalDoc?.type;
  if (type && type !== "article") {
    return data;
  }

  const next = suggestedNotificationCopy({
    title: data.title ?? originalDoc?.title,
    keyPoints: data.keyPoints ?? originalDoc?.keyPoints,
  });
  const previous = originalDoc ? suggestedNotificationCopy(originalDoc) : null;

  const refresh = (current: unknown, earlier: string | undefined) => {
    const text = typeof current === "string" ? current.trim() : "";
    return text === "" || text === earlier;
  };

  if (refresh(data.notificationTitle, previous?.title)) {
    data.notificationTitle = next.title;
  }
  if (refresh(data.notificationBody, previous?.body)) {
    data.notificationBody = next.body;
  }
  return data;
};
