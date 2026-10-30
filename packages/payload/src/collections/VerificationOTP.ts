import type { CollectionConfig } from "payload";
import { isSuperAdmin } from "../access/adminRoles";

const VerificationOTP: CollectionConfig = {
  slug: "verification-otp",
  // One-time codes / device tokens, written by the server (local API). No
  // editor or viewer has a reason to read or change them over REST.
  access: {
    create: isSuperAdmin,
    read: isSuperAdmin,
    update: isSuperAdmin,
    delete: isSuperAdmin,
  },
  admin: {
    hidden: process.env.NODE_ENV === "production",
  },
  fields: [
    {
      name: "otp",
      type: "number",
      required: true,
    },
    {
      name: "token",
      type: "text",
      required: true,
    },
    {
      name: "userId",
      type: "number",
      required: true,
    },
    {
      name: "createdAt",
      type: "date",
      defaultValue: () => new Date().toISOString(),
    },
  ],
};

export default VerificationOTP;
