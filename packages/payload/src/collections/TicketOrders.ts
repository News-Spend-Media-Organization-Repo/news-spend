import type { CollectionConfig } from "payload";

import { isStaff, readOwnOrStaff } from "../access/adminRoles";

/**
 * One row per Shows purchase, written by the API server through the Local
 * API. `clientRef` and the order references are unique so a retried request
 * cannot book the same seat twice; the buyer signs in to read their own
 * orders, staff read all.
 */
export const TicketOrders: CollectionConfig = {
  slug: "ticket-orders",
  admin: {
    group: "Events",
    useAsTitle: "clientRef",
    defaultColumns: ["clientRef", "eventName", "state", "amountMinor", "user"],
  },
  access: {
    read: readOwnOrStaff,
    create: isStaff,
    update: isStaff,
    delete: isStaff,
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
      name: "clientRef",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "idempotencyKey",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "reference",
      type: "text",
      unique: true,
      index: true,
    },
    {
      name: "orderReference",
      type: "text",
      unique: true,
      index: true,
    },
    {
      name: "state",
      type: "select",
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Paid", value: "paid" },
        { label: "Expired", value: "expired" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Refunded", value: "refunded" },
        { label: "Failed", value: "failed" },
      ],
    },
    {
      name: "orderVersion",
      type: "text",
    },
    {
      name: "refundVersion",
      type: "text",
    },
    {
      name: "eventId",
      type: "text",
    },
    {
      name: "eventName",
      type: "text",
    },
    {
      name: "sessionId",
      type: "text",
      index: true,
    },
    {
      name: "sessionAt",
      type: "date",
    },
    {
      name: "items",
      type: "json",
    },
    {
      name: "amountMinor",
      type: "number",
    },
    {
      name: "currency",
      type: "text",
      defaultValue: "NGN",
    },
    {
      name: "refundedMinor",
      type: "number",
      defaultValue: 0,
    },
    {
      name: "buyer",
      type: "group",
      fields: [
        { name: "name", type: "text" },
        { name: "email", type: "text" },
        { name: "phone", type: "text" },
      ],
    },
    {
      name: "pointsAwarded",
      type: "number",
      defaultValue: 0,
    },
    {
      name: "lastSyncedAt",
      type: "date",
    },
  ],
};
