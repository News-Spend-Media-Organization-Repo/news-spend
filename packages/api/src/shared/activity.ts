import { activityPoints } from "@news-spend-media/payload/lib/activityPoints";
import {
  enum_activities_action,
  enum_activities_type,
} from "@news-spend-media/payload/payload-generated-schema";
import { createORPCErrorConstructorMap } from "@orpc/contract";
import { isSameDay } from "date-fns";
import z from "zod";

import type { Context } from "../context";
import { commonErrors } from "../errors";
import { withKeyedLock } from "../lib/keyedLock";

// `addActivity` runs outside a procedure's handler context, so it cannot use
// the `errors` factory that oRPC injects there. Build the same factories from
// the shared error map so thrown errors stay defined/inferable on the wire.
const errors = createORPCErrorConstructorMap(commonErrors);

// --- trusted, server-only ----------------------------------------------------

const TrustedActivityInput = z.object({
  type: z.enum(enum_activities_type.enumValues).default("point"),
  point: z.number(),
  reward: z.string().optional(),
  description: z.string().optional(),
  action: z.enum(enum_activities_action.enumValues),
  newsId: z.string().optional(),
});

type TrustedActivityInputType = z.infer<typeof TrustedActivityInput>;

/**
 * Adds an activity from trusted server code (for example the survey award).
 *
 * Never call this from a client-facing procedure: it stores the caller's point
 * and description. `activity.add` uses {@link addClientActivity}, which decides
 * both on the server.
 */
export async function addActivity(
  input: TrustedActivityInputType,
  ctx: Context
) {
  const { user, payload } = ctx;
  if (!user) {
    throw errors.UNAUTHORIZED();
  }

  const { newsId, ...rest } = input;

  if (rest.action === "read") {
    const reward = await payload.find({
      collection: "activities",
      where: {
        action: {
          equals: "read",
        },
        news: {
          equals: newsId,
        },
        user: {
          equals: user.id,
        },
      },
    });

    if (reward.docs.length > 0) {
      return {
        data: reward.docs[0],
        message: "ALREADY_READ",
      };
    }

    const dailyRead = user.dailyRead ?? {
      count: 0,
      updatedAt: new Date().toISOString(),
    };
    // @ts-expect-error
    const { count, updatedAt } = dailyRead;

    const isToday = isSameDay(
      new Date(),
      new Date(updatedAt ?? new Date().toISOString())
    );

    if (isToday && count! < 5) {
      await payload.update({
        collection: "users",
        id: user.id,
        data: {
          dailyRead: {
            count: count! + 1,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    } else if (!isToday) {
      await payload.update({
        collection: "users",
        id: user.id,
        data: {
          dailyRead: {
            count: 1,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    }
  }

  if (rest.action === "musicListeningTime") {
    const activity = await payload.find({
      collection: "activities",
      where: {
        user: {
          equals: user.id,
        },
        action: {
          equals: "musicListeningTime",
        },
        createdAt: {
          greater_than_equal: new Date().setHours(0, 0, 0, 0),
        },
      },
    });

    if (activity.totalDocs > 0) {
      return {
        data: activity.docs[0],
        message: "ALREADY_EXISTS",
      };
    }
  }

  if (rest.action === "connectBrandAd" || rest.action === "share") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cap = rest.action === "connectBrandAd" ? 8 : 5;

    const activities = await payload.find({
      collection: "activities",
      where: {
        user: {
          equals: user.id,
        },
        action: {
          equals: rest.action,
        },
        createdAt: {
          greater_than_equal: today.toISOString(),
        },
      },
    });

    if (activities.totalDocs >= cap) {
      return {
        message: "CAP_REACHED",
      };
    }
  }

  const result = await payload.create({
    collection: "activities",
    data: {
      ...rest,
      news: newsId,
      user: user.id,
    },
  });

  return result;
}

// --- client-facing -----------------------------------------------------------

/** The app-share award. */
export const APP_SHARE_POINTS = 20;

/** The connect-a-brand award. */
export const CONNECT_BRAND_AD_POINTS = 10;

/** Articles that pay per day, the same limit the app's reader tracker uses. */
export const DAILY_READ_CAP = 5;

const ALLOWED_ACTIONS = ["read", "share", "connectBrandAd"] as const;

type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

const isAllowedAction = (action: string): action is AllowedAction =>
  (ALLOWED_ACTIONS as readonly string[]).includes(action);

/**
 * The client may still send `point`, `type`, `reward` and `description` so
 * older builds keep working, but the server decides all four. Only the action
 * and the id of the thing acted on are read.
 */
export const ActivityCreateInput = z.object({
  type: z.string().optional(),
  point: z.number().optional(),
  reward: z.string().optional(),
  description: z.string().optional(),
  action: z.string(),
  newsId: z.string().optional(),
  partnerContentId: z.string().optional(),
});

type ActivityCreateInputType = z.infer<typeof ActivityCreateInput>;

type Award = {
  amount: number;
  description: string;
  newsId?: string;
};

const titleOf = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const refuse = (
  ctx: Context,
  action: string,
  id: string | undefined,
  value: unknown
): never => {
  ctx.payload.logger.error(
    { action, id, points: value },
    "Activity points outside the allowed range"
  );
  throw errors.BAD_REQUEST({ message: "points out of range" });
};

const decideAward = async (
  ctx: Context,
  action: AllowedAction,
  { newsId, partnerContentId }: ActivityCreateInputType
): Promise<Award> => {
  const { payload } = ctx;

  if (action === "read") {
    if (!newsId) {
      throw errors.BAD_REQUEST({ message: "newsId is required" });
    }
    const article = await payload.findByID({
      collection: "news",
      id: newsId,
      depth: 0,
      disableErrors: true,
    });
    if (!article) {
      throw errors.BAD_REQUEST({ message: "article not found" });
    }
    const amount = activityPoints(article.points);
    if (amount === null) {
      refuse(ctx, action, newsId, article.points);
    }
    return {
      amount,
      description: `Read: ${titleOf(article.title, "article")}`,
      newsId,
    };
  }

  if (action === "share") {
    if (!partnerContentId) {
      return { amount: APP_SHARE_POINTS, description: "Shared app" };
    }
    const content = await payload.findByID({
      collection: "partner-content",
      id: partnerContentId,
      depth: 0,
      disableErrors: true,
    });
    if (!content) {
      throw errors.BAD_REQUEST({ message: "content not found" });
    }
    if (content.status !== "active") {
      throw errors.BAD_REQUEST({ message: "content is not active" });
    }
    const amount = activityPoints(content.points);
    if (amount === null) {
      refuse(ctx, action, partnerContentId, content.points);
    }
    return {
      amount,
      description: `Shared: ${titleOf(content.title, "content")}`,
    };
  }

  return {
    amount: CONNECT_BRAND_AD_POINTS,
    description: "Connected with a brand",
  };
};

/**
 * Adds an activity for the signed-in user from the `activity.add` endpoint.
 *
 * The amount and description are decided here from the action and the server's
 * own records; nothing the client sends for `point`, `type`, `reward` or
 * `description` is stored. The check-then-create runs under a process-local
 * keyed lock so simultaneous requests cannot beat the once-per-article rule or
 * the daily caps.
 */
export async function addClientActivity(
  input: ActivityCreateInputType,
  ctx: Context
) {
  const { user, payload } = ctx;
  if (!user) {
    throw errors.UNAUTHORIZED();
  }

  if (!isAllowedAction(input.action)) {
    throw errors.BAD_REQUEST({ message: "action not allowed" });
  }

  const award = await decideAward(ctx, input.action, input);
  const lockKey =
    input.action === "read"
      ? // Per user, not per article: the daily read cap is a user total, so
        // two different articles arriving together must not both see 4.
        `activity:read:${user.id}`
      : `activity:${input.action}:${user.id}`;

  return withKeyedLock(lockKey, async () => {
    if (input.action === "read") {
      const reward = await payload.find({
        collection: "activities",
        where: {
          action: {
            equals: "read",
          },
          news: {
            equals: award.newsId,
          },
          user: {
            equals: user.id,
          },
        },
      });

      if (reward.docs.length > 0) {
        return {
          data: reward.docs[0],
          message: "ALREADY_READ",
          pointsAwarded: 0,
        };
      }

      /**
       * The app stops asking after five reads, but that limit lived only in
       * the client. Counted from the ledger so it is the same under a stale
       * session, a reinstall, or a modified build.
       */
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const readsToday = await payload.count({
        collection: "activities",
        where: {
          and: [
            { user: { equals: user.id } },
            { action: { equals: "read" } },
            { createdAt: { greater_than_equal: startOfDay.toISOString() } },
          ],
        },
      });
      if (readsToday.totalDocs >= DAILY_READ_CAP) {
        return {
          message: "CAP_REACHED",
          pointsAwarded: 0,
        };
      }

      const dailyRead = (
        user as unknown as {
          dailyRead?: { count: number; updatedAt?: string };
        }
      ).dailyRead ?? {
        count: 0,
        updatedAt: new Date().toISOString(),
      };
      const { count, updatedAt } = dailyRead;

      const isToday = isSameDay(
        new Date(),
        new Date(updatedAt ?? new Date().toISOString())
      );

      if (isToday && count < 5) {
        await payload.update({
          collection: "users",
          id: user.id,
          data: {
            dailyRead: {
              count: count + 1,
              updatedAt: new Date().toISOString(),
            },
          },
        });
      } else if (!isToday) {
        await payload.update({
          collection: "users",
          id: user.id,
          data: {
            dailyRead: {
              count: 1,
              updatedAt: new Date().toISOString(),
            },
          },
        });
      }
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const cap = input.action === "connectBrandAd" ? 8 : 5;

      const todaysActivities = await payload.find({
        collection: "activities",
        where: {
          user: {
            equals: user.id,
          },
          action: {
            equals: input.action,
          },
          createdAt: {
            greater_than_equal: today.toISOString(),
          },
        },
      });

      if (todaysActivities.totalDocs >= cap) {
        return {
          message: "CAP_REACHED",
          pointsAwarded: 0,
        };
      }
    }

    const result = await payload.create({
      collection: "activities",
      data: {
        type: "point",
        action: input.action,
        point: award.amount,
        description: award.description,
        ...(award.newsId ? { news: award.newsId } : {}),
        user: user.id,
      },
    });

    return { ...result, pointsAwarded: award.amount };
  });
}
