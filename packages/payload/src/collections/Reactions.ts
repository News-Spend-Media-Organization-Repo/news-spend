import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  PayloadRequest,
} from "payload";

import notifyOnCommentLike from "../hooks/reactions/notifyOnCommentLike";

type ReactionDoc = {
  id: string | number;
  target?: {
    relationTo?: string;
    value?: string | { id?: string } | null;
  } | null;
  news?: string | { id?: string } | null;
  [key: string]: unknown;
};

async function recalculateCounts(
  doc: ReactionDoc,
  req: PayloadRequest
): Promise<unknown> {
  try {
    const { payload } = req;

    let targetId: string | undefined;
    let targetCollection: "news" | "comments" | undefined;
    if (doc.target) {
      targetId =
        typeof doc.target.value === "object"
          ? doc.target.value?.id
          : (doc.target.value ?? undefined);
      targetCollection = doc.target.relationTo as
        | "news"
        | "comments"
        | undefined;
    }

    if (!targetId && doc.news) {
      targetId = typeof doc.news === "object" ? doc.news.id : doc.news;
      targetCollection = "news";
    }

    if (!(targetId && targetCollection)) {
      return doc;
    }

    const [likesCount, dislikesCount] = await Promise.all([
      payload.count({
        collection: "reactions",
        where: {
          "target.value": { equals: targetId },
          "target.relationTo": { equals: targetCollection },
          type: { equals: "like" },
        },
        req,
      }),
      payload.count({
        collection: "reactions",
        where: {
          "target.value": { equals: targetId },
          "target.relationTo": { equals: targetCollection },
          type: { equals: "dislike" },
        },
        req,
      }),
    ]);

    await payload.update({
      collection: targetCollection,
      id: targetId,
      data: {
        likesCount: likesCount.totalDocs,
        dislikesCount: dislikesCount.totalDocs,
      },
      req,
    });
    return doc;
  } catch (error) {
    req.payload.logger.error(
      { error },
      "Failed to recalculate reaction counts"
    );
  }
}

const afterChange: CollectionAfterChangeHook = ({ doc, req }) =>
  recalculateCounts(
    doc as ReactionDoc,
    req
  ) as ReturnType<CollectionAfterChangeHook>;

const afterDelete: CollectionAfterDeleteHook = ({ doc, req }) =>
  recalculateCounts(
    doc as ReactionDoc,
    req
  ) as ReturnType<CollectionAfterDeleteHook>;

const Reactions: CollectionConfig = {
  slug: "reactions",
  hooks: {
    afterChange: [afterChange, notifyOnCommentLike],
    afterDelete: [afterDelete],
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "news",
      type: "relationship",
      relationTo: "news",
      index: true,
      admin: {
        hidden: true,
        description:
          "Legacy field. Kept during the polymorphic-target migration. Will be removed after the data migration confirms all rows have `target` set.",
      },
    },
    {
      name: "target",
      type: "relationship",
      relationTo: ["news", "comments"],
      required: true,
      index: true,
    },
    {
      name: "type",
      type: "select",
      options: ["like", "dislike", "none"],
      required: true,
    },
  ],
};

export default Reactions;
