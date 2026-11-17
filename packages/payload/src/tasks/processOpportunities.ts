import { createHash } from "node:crypto";
import type { Payload, TaskConfig } from "payload";
import { contentFromDoc } from "../opportunities/content";
import { rankOpportunities } from "../opportunities/engine";
import { ingestSource } from "../opportunities/ingestion";
import { readProfile } from "../opportunities/model";
import { opportunitySettings } from "../opportunities/settings";

function notificationId(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function remind(payload: Payload): Promise<void> {
  const now = new Date().toISOString();
  const due = await payload.find({
    collection: "saved-opportunities",
    where: {
      and: [
        { reminderAt: { less_than_equal: now } },
        { reminderSentAt: { exists: false } },
      ],
    },
    limit: 100,
    sort: "reminderAt",
    depth: 1,
  });
  for (const saved of due.docs) {
    const userId = typeof saved.user === "string" ? saved.user : saved.user.id;
    const profiles = await payload.find({
      collection: "opportunity-profiles",
      where: { user: { equals: userId } },
      limit: 1,
    });
    // No profile row means the reader never opened preferences: the reminder
    // they set on the saved record is the only opt-in we have. Only a stored
    // profile can opt them out.
    const storedProfile = profiles.docs[0];
    if (storedProfile) {
      const profile = readProfile(storedProfile.preferences);
      if (profile.notifications.paused || !profile.notifications.deadlines) {
        continue;
      }
    }
    const item =
      typeof saved.opportunity === "object" ? saved.opportunity : null;
    if (
      !item?.deadline ||
      Date.parse(item.deadline) <= Date.now() ||
      item.status !== "published"
    ) {
      await payload.update({
        collection: "saved-opportunities",
        id: saved.id,
        data: { reminderSentAt: now },
      });
      continue;
    }
    const id = notificationId(`${saved.id}:${saved.reminderAt}`);
    const existing = await payload.find({
      collection: "notifications",
      where: { opportunityDeliveryKey: { equals: id } },
      limit: 1,
    });
    if (!existing.docs.length) {
      await payload.create({
        collection: "notifications",
        data: {
          opportunityDeliveryKey: id,
          _status: "published",
          title: "Deadline approaching",
          body: `${item.title} closes on ${new Date(item.deadline).toDateString()}.`,
          type: "misc",
          targetType: "specific",
          specificUsers: [userId],
          deliveryAction: "send-now",
          data: {
            url: `https://link.newsspend.com/for-you/opportunity/${item.id}`,
            forYouKind: "deadlines",
            opportunityId: item.id,
          },
        },
      });
    }
    await payload.update({
      collection: "saved-opportunities",
      id: saved.id,
      data: { reminderSentAt: now },
    });
  }
}

/** One bounded daily digest per reader, independent of standard news campaigns. */
async function sendDiscoveryDigests(payload: Payload): Promise<void> {
  const settings = await opportunitySettings(payload);
  if (!settings.dailyDigestEnabled) {
    return;
  }
  const now = new Date().toISOString();
  const profiles = await payload.find({
    collection: "opportunity-profiles",
    where: {
      or: [
        { lastNotifiedAt: { exists: false } },
        {
          lastNotifiedAt: {
            less_than_equal: new Date(
              Date.now() - settings.digestIntervalHours * 3_600_000
            ).toISOString(),
          },
        },
      ],
    },
    sort: "lastNotifiedAt",
    limit: 50,
  });
  for (const stored of profiles.docs) {
    const profile = readProfile(stored.preferences);
    const user = typeof stored.user === "string" ? stored.user : stored.user.id;
    if (
      profile.personalized &&
      profile.consent &&
      !profile.notifications.paused &&
      (profile.notifications.opportunities || profile.notifications.discovery)
    ) {
      const candidates = await payload.find({
        collection: "opportunities",
        where: {
          and: [
            { status: { equals: "published" } },
            { "source.status": { equals: "approved" } },
            // Same deadline rule as the feed: never notify about expired items.
            {
              or: [
                { deadline: { exists: false } },
                { deadline: { greater_than: now } },
              ],
            },
            {
              publishedAt: {
                greater_than: stored.lastNotifiedAt ?? stored.createdAt,
              },
            },
          ],
        },
        sort: "-publishedAt",
        limit: 50,
        depth: 1,
      });
      const content = candidates.docs.map(contentFromDoc);
      // Rank with the same CMS settings the feed uses, so a featured or
      // quality-boosted item wins in the digest exactly as it does in the app.
      const selected = rankOpportunities(
        content,
        profile,
        [],
        Date.now(),
        settings
      ).find((item) =>
        item.discovery
          ? profile.notifications.discovery
          : profile.notifications.opportunities
      );
      if (selected) {
        const key = notificationId(`for-you:${user}:${now.slice(0, 10)}`);
        const existing = await payload.find({
          collection: "notifications",
          where: { opportunityDeliveryKey: { equals: key } },
          limit: 1,
        });
        if (!existing.docs.length) {
          await payload.create({
            collection: "notifications",
            data: {
              opportunityDeliveryKey: key,
              _status: "published",
              type: "misc",
              targetType: "specific",
              specificUsers: [user],
              title: selected.discovery
                ? "You may be interested in this"
                : "Something new for you",
              body: selected.title,
              deliveryAction: "send-now",
              data: {
                url: `https://link.newsspend.com/for-you/opportunity/${selected.id}`,
                forYouKind: selected.discovery ? "discovery" : "opportunities",
              },
            },
          });
        }
      }
    }
    await payload.update({
      collection: "opportunity-profiles",
      id: stored.id,
      data: { lastNotifiedAt: now },
    });
  }
}

export const processOpportunitiesTask: TaskConfig = {
  slug: "processOpportunities",
  schedule: [{ cron: "*/15 * * * *", queue: "default" }],
  retries: 1,
  handler: async ({ req }) => {
    const { payload } = req;
    // Bounded work per run; cold sources are processed before recently polled ones.
    const sources = await payload.find({
      collection: "opportunity-sources",
      where: { status: { equals: "approved" } },
      sort: "lastFetchedAt",
      limit: 10,
    });
    for (const source of sources.docs) {
      try {
        await ingestSource(payload, source.id);
      } catch (error) {
        await payload.update({
          collection: "opportunity-sources",
          id: source.id,
          data: {
            lastFetchedAt: new Date().toISOString(),
            lastError:
              error instanceof Error
                ? error.message.slice(0, 250)
                : "Source import failed",
          },
        });
      }
    }
    await payload.update({
      collection: "opportunities",
      where: {
        and: [
          { status: { equals: "published" } },
          { deadline: { less_than_equal: new Date().toISOString() } },
        ],
      },
      data: { status: "expired" },
    });
    await remind(payload);
    await sendDiscoveryDigests(payload);
    return { output: {} };
  },
};
