import type { CollectionConfig, PayloadRequest } from "payload";
import { ValidationError } from "payload";

import { authenticated } from "../access/authenticated";
import { adminOnly } from "../access/hasRole";
import { resolveNotificationUrl } from "../lib/notification-link";
import {
  normalisePlaceholders,
  validatePlaceholders,
} from "../lib/personalise";
import { queueNotificationSend } from "../lib/pushQueue";
import { NOTIFICATION_TYPES } from "./NotificationInbox";

/**
 * Drop any send still waiting for this notification.
 *
 * The afterChange hook queues on every published save, so without this a
 * second save before the send time leaves two jobs waiting on the same
 * notification and everyone receives it twice. Editing a scheduled
 * notification is normal (a typo, a reworded title, or a time an
 * administrator in another timezone believed was wrong), so the duplicate was
 * easy to produce and invisible until the pushes landed.
 *
 * Only unstarted jobs are removed: one already running or completed is a send
 * that has happened, and deleting its row would not unsend it.
 */
async function cancelPendingSends(
  notificationId: string,
  req: PayloadRequest
): Promise<void> {
  try {
    await req.payload.delete({
      collection: "payload-jobs",
      where: {
        and: [
          { taskSlug: { equals: "sendScheduledNotification" } },
          { "input.notificationId": { equals: notificationId } },
          { completedAt: { exists: false } },
          { processing: { not_equals: true } },
        ],
      },
      req,
    });
  } catch (err) {
    // A failure to tidy up must not block the save. The worst case is the
    // duplicate this exists to prevent, which is better than an editor being
    // unable to fix a typo.
    req.payload.logger.error({
      msg: "Notifications: could not cancel pending scheduled sends",
      err,
      notificationId,
    });
  }
}

const Notifications: CollectionConfig = {
  slug: "notifications",
  admin: {
    useAsTitle: "title",
    group: "Push Notifications",
  },
  versions: {
    drafts: true,
  },
  access: {
    read: authenticated,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
      validate: validatePlaceholders,
      admin: {
        description:
          "Notification title. Write {{firstName}} to address each user by first name, e.g. '{{firstName}}, a giveaway is live'. Each recipient sees their own first name in its place.",
      },
    },
    {
      name: "body",
      type: "textarea",
      required: true,
      validate: validatePlaceholders,
      admin: {
        description:
          "Notification message body. Write {{firstName}} to address each user by first name; it is replaced at send time, or the leading greeting is dropped for a reader with no name.",
      },
    },
    {
      name: "type",
      type: "select",
      options: NOTIFICATION_TYPES,
      defaultValue: "misc",
      admin: {
        description: "Notification category",
      },
    },
    {
      name: "data",
      type: "json",
      label: "Opens",
      admin: {
        description: "Where a tap on the notification sends the reader.",
        components: {
          Field:
            "@news-spend-media/payload/components/NotificationDestination#NotificationDestinationField",
        },
      },
    },
    {
      name: "deliveryAction",
      type: "radio",
      options: [
        {
          label: "Send Immediately",
          value: "send-now",
        },
        {
          label: "Schedule",
          value: "schedule",
        },
      ],
      defaultValue: "send-now",
      admin: {
        description: "Choose when to deliver this notification",
      },
    },
    {
      name: "scheduledFor",
      type: "date",
      /**
       * The instant is absolute; the timezone records who chose it.
       *
       * `scheduled_for` is a `timestamptz`, so the moment of delivery has
       * never been in doubt: the job runner fires it at one instant and every
       * reader on earth gets it then. What was missing is the *intent* behind
       * the number. Without a recorded zone, an administrator in Lagos who
       * schedules 10:00 and one in Toronto who opens the same document see
       * 10:00 and 05:00, and the second may "correct" a time that was never
       * wrong, moving the send for everyone.
       *
       * Storing the zone alongside makes the entry self-describing: the
       * document says "10:00 Africa/Lagos", which reads the same in Toronto.
       */
      timezone: true,
      admin: {
        condition: (data) => data?.deliveryAction === "schedule",
        description:
          "When to send this notification. Pick the time and the timezone you mean it in; everyone receives it at that same moment, shown in their own local time.",
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "targetType",
      type: "select",
      options: ["all", "segment", "specific"],
      defaultValue: "all",
      admin: {
        description: "Target audience type",
      },
    },
    {
      name: "segment",
      type: "select",
      options: [
        {
          label: "Active Users",
          value: "active-users",
        },
        {
          label: "Inactive Users (30+ days)",
          value: "inactive-users",
        },
        {
          label: "New Users (7 days)",
          value: "new-users",
        },
      ],
      admin: {
        condition: (data) => data?.targetType === "segment",
        description: "User segment to target",
      },
    },
    {
      name: "specificUsers",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
      admin: {
        condition: (data) => data?.targetType === "specific",
        description: "Specific users to target",
      },
    },
    {
      name: "deviceTypes",
      type: "select",
      options: ["all", "ios", "android"],
      defaultValue: "all",
      hasMany: true,
      admin: {
        description: "Device types to target",
      },
    },
    {
      name: "priority",
      type: "select",
      options: ["default", "high", "normal"],
      defaultValue: "default",
      admin: {
        description: "Notification priority",
      },
    },
    {
      name: "sound",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Play sound when notification is received",
      },
    },
    {
      name: "badge",
      type: "number",
      admin: {
        description: "Number to display on app icon badge (iOS only)",
      },
    },
    {
      name: "sentAt",
      type: "date",
      admin: {
        readOnly: true,
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "When this notification was sent",
      },
    },
    {
      name: "correctNotification",
      type: "ui",
      label: "Correct a sent notification",
      admin: {
        components: {
          Field:
            "@news-spend-media/payload/components/CorrectNotification#CorrectNotification",
        },
      },
    },
    {
      name: "totalDelivered",
      type: "number",
      virtual: true,
      admin: {
        readOnly: true,
        description:
          "Total number of recipients who received this notification",
      },
    },
    {
      name: "totalFailed",
      type: "number",
      virtual: true,
      admin: {
        readOnly: true,
        description:
          "Total number of recipients who failed to receive this notification",
      },
    },
    {
      name: "totalOpened",
      type: "number",
      virtual: true,
      admin: {
        readOnly: true,
        description: "Total number of recipients who opened this notification",
      },
    },
    {
      name: "createdAt",
      type: "date",
      admin: {
        readOnly: true,
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "updatedAt",
      type: "date",
      admin: {
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeValidate: [
      /**
       * A campaign with no routable `data.url` is delivered, tapped, and lands
       * on whatever screen the app happened to be on — in practice the home
       * feed. Nothing errors and no delivery is marked failed, so an operator
       * only finds out from complaints. Refuse to publish one instead, and
       * rewrite share links / legacy paths to the app's canonical shape.
       */
      ({ data }) => {
        if (!data) {
          return data;
        }

        for (const field of ["title", "body"] as const) {
          const value = data[field];
          if (typeof value === "string") {
            data[field] = normalisePlaceholders(value);
          }
        }

        if (data._status !== "published" || data.sentAt) {
          return data;
        }

        const payloadData =
          data.data &&
          typeof data.data === "object" &&
          !Array.isArray(data.data)
            ? (data.data as Record<string, unknown>)
            : {};

        const target = resolveNotificationUrl(payloadData);

        if (target === null) {
          return data;
        }

        if ("error" in target) {
          throw new ValidationError({
            collection: "notifications",
            errors: [
              {
                path: "data",
                message:
                  target.error === "missing"
                    ? "Choose where the notification opens — a news article or a screen. Without it a tap opens the app on the home screen."
                    : "This notification's destination is not a screen the app can open. Pick an article or a screen instead.",
              },
            ],
          });
        }

        data.data = { ...payloadData, url: target.url };
        return data;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        await req.payload.delete({
          collection: "notification-inbox",
          where: { notification: { equals: doc.id } },
          req,
        });

        await req.payload.delete({
          collection: "notification-deliveries",
          where: { notification: { equals: doc.id } },
          req,
        });
      },
    ],
    afterChange: [
      async ({ operation, doc, req }) => {
        if (operation !== "create" && operation !== "update") {
          return doc;
        }

        if (doc._status !== "published") {
          return doc;
        }

        if (doc.sentAt) {
          return doc;
        }

        const deliveryAction = doc.deliveryAction;

        if (deliveryAction === "schedule" && doc.scheduledFor) {
          await cancelPendingSends(doc.id, req);

          await req.payload.jobs.queue({
            task: "sendScheduledNotification",
            input: { notificationId: doc.id },
            waitUntil: new Date(doc.scheduledFor),
          });
          return doc;
        }

        // Switched from scheduled back to immediate, or unscheduled entirely:
        // whatever was waiting must not still fire.
        if (deliveryAction !== "schedule") {
          await cancelPendingSends(doc.id, req);
        }

        if (deliveryAction === "send-now") {
          // A caller that must not wait for the fan-out (publishing an
          // article) asks for it to be queued; anything else, such as a
          // campaign sent from the admin, still sends before it returns.
          if (req.context?.deferSend) {
            await queueNotificationSend(req, doc.id);
          } else {
            const { sendNotification } = await import(
              "../lib/expo-push-service"
            );
            await sendNotification(doc.id, req);
          }
        }

        return doc;
      },
    ],
    afterRead: [
      async ({ req, doc }) => {
        /**
         * Payload also runs this hook for version snapshots, whose body has no
         * `id`. Querying with it threw a UUID error that Payload swallowed,
         * turning the Versions tab into a 404.
         */
        if (!doc?.id) {
          return doc;
        }

        const [delivered, failed, opened] = await Promise.all([
          req.payload.count({
            collection: "notification-deliveries",
            where: {
              status: { equals: "delivered" },
              notification: { equals: doc.id },
            },
          }),
          req.payload.count({
            collection: "notification-deliveries",
            where: {
              status: { equals: "failed" },
              notification: { equals: doc.id },
            },
          }),
          req.payload.count({
            collection: "notification-inbox",
            where: {
              clickCount: { greater_than: 0 },
              notification: { equals: doc.id },
            },
          }),
        ]);

        doc.totalDelivered = delivered.totalDocs;
        doc.totalFailed = failed.totalDocs;
        doc.totalOpened = opened.totalDocs;

        return doc;
      },
    ],
  },
  endpoints: [
    {
      path: "/:id/errors",
      method: "get",
      handler: async (req) => {
        const errorLogs = await req.payload.find({
          collection: "notification-deliveries",
          pagination: false,
          depth: 0,
          where: {
            status: { equals: "failed" },
            notification: { equals: req.routeParams?.id },
          },
        });

        return Response.json(errorLogs);
      },
    },
    {
      /**
       * Correct a campaign that has already gone out. A delivered push cannot be
       * recalled, so this re-sends the saved copy to the devices the campaign
       * originally reached, using the same notification id as the OS-level
       * collapse id/tag. Where the notification is still visible it is replaced
       * in place; inbox copies are updated rather than duplicated.
       */
      path: "/:id/correct",
      method: "post",
      handler: async (req) => {
        const user = req.user;

        // Same bar as updating a notification: adminOnly is super-admin.
        if (user?.collection !== "admins" || user?.role !== "super-admin") {
          return Response.json(
            { message: "Only a Super Admin can correct a notification." },
            { status: 403 }
          );
        }

        const id = req.routeParams?.id;
        if (typeof id !== "string") {
          return Response.json(
            { message: "Notification not found." },
            { status: 404 }
          );
        }

        try {
          const { correctNotification } = await import(
            "../lib/expo-push-service"
          );
          const result = await correctNotification(id, req);

          return Response.json({
            message:
              result.recipients > 0
                ? `Correction sent to ${result.recipients} device${result.recipients === 1 ? "" : "s"}.`
                : "No devices to re-send to.",
          });
        } catch (error) {
          req.payload.logger.error({
            msg: "Notifications: correction failed",
            err: error,
            notificationId: id,
          });
          return Response.json(
            {
              message:
                error instanceof Error
                  ? error.message
                  : "Could not correct the notification.",
            },
            { status: 400 }
          );
        }
      },
    },
  ],
};

export default Notifications;
