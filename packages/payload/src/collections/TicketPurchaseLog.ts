import type { CollectionConfig } from "payload";

const TicketPurchaseLog: CollectionConfig = {
  slug: "ticket-purchase-log",
  admin: {
    group: "Lottery",
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    {
      name: "lottery",
      type: "relationship",
      relationTo: "lottery",
      required: true,
    },
    {
      name: "ticketQuantity",
      type: "number",
      required: true,
    },
  ],
};

export default TicketPurchaseLog;
