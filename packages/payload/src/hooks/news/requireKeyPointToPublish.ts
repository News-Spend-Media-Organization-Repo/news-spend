import type { CollectionBeforeValidateHook } from "payload";
import { ValidationError } from "payload";

import { firstKeyPoint } from "./notificationCopy";

/**
 * A new article needs at least one key point before it can be published: it
 * is what readers see first and what the push says by default.
 *
 * Drafts are never blocked, and neither is editing an article that has already
 * been published, so older articles written without key points can still be
 * corrected. The rule is checked here rather than on the field because it
 * depends on the article's history.
 */
export const requireKeyPointToPublish: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
}) => {
  if (data?._status !== "published" || originalDoc?.hasBeenPublished) {
    return data;
  }
  const type = data.type ?? originalDoc?.type;
  if (type && type !== "article") {
    return data;
  }
  if (firstKeyPoint({ keyPoints: data.keyPoints ?? originalDoc?.keyPoints })) {
    return data;
  }

  throw new ValidationError({
    collection: "news",
    errors: [
      {
        path: "keyPoints",
        message:
          "Add at least one key point before publishing. The first one is also the default push notification text.",
      },
    ],
  });
};
