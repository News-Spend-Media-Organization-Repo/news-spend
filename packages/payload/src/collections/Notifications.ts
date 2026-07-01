import type { CollectionConfig } from "payload";

import { authenticated } from "../access/authenticated";
import { adminOnly } from "../access/hasRole";
import { NOTIFICATION_TYPES } from "./NotificationInbox";

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
      admin: {
        description: "Notification title",
      },
    },
    {
      name: "body",
      type: "textarea",
      required: true,
      admin: {
        description: "Notification message body",
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
      admin: {
        description: "Additional data to send with the notification",
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
      admin: {
        condition: (data) => data?.deliveryAction === "schedule",
        description: "When to send this notification (your local time)",
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
          await req.payload.jobs.queue({
            task: "sendScheduledNotification",
            input: { notificationId: doc.id },
            waitUntil: new Date(doc.scheduledFor),
          });
          return doc;
        }

        if (deliveryAction === "send-now") {
          const { sendNotification } = await import("../lib/expo-push-service");
          await sendNotification(doc.id, req);
        }

        return doc;
      },
    ],
    afterRead: [
      async ({ req, doc }) => {
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
  ],
};

export default Notifications;
