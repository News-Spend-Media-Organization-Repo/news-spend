import type { BasePayload } from "payload";

import type { PushToken } from "../payload-types";

export async function sendNotification({
  pushTokens,
  title,
  body,
  data,
}: {
  pushTokens: PushToken[];
  title: string;
  body: string;
  data: Record<string, unknown>;
}) {
  if (!pushTokens.length) {
    return;
  }

  const { getPayload } = await import("../lib/getPayload");
  const payload = await getPayload();

  // Extract unique user IDs from the push token docs
  const userIds = [
    ...new Set(
      pushTokens
        .map((t) =>
          typeof t.user === "object" && t.user !== null
            ? (t.user as { id: string }).id
            : (t.user as string | null | undefined)
        )
        .filter((id): id is string => !!id)
    ),
  ];

  await payload.create({
    collection: "notifications",
    data: {
      specificUsers: userIds,
      title,
      body,
      priority: "high",
      sound: true,
      data: data ?? {},
    },
  });
}

// send notification to all lottery participants
export async function sendLotteryNotification({
  lotteryId,
  payload,
}: {
  lotteryId: string;
  payload: BasePayload;
}) {
  const { docs: lotteryParticipants } = await payload.find({
    collection: "lottery-tickets",
    where: {
      lottery: {
        equals: lotteryId,
      },
    },
  });

  const pushTokens = await payload.find({
    collection: "push-tokens",
    where: {
      user: {
        in: lotteryParticipants.map((lottery) =>
          typeof lottery.user === "string" ? lottery.user : lottery.user.id
        ),
      },
    },
  });

  await sendNotification({
    pushTokens: pushTokens.docs,
    title: "Giveaway has ended",
    body: "Check to see if you won",
    data: {
      lotteryId,
      type: "lottery",
      url: "discover",
    },
  });
}
