import type { CollectionConfig } from "payload";

const IdentityVerification: CollectionConfig = {
  slug: "identity-verification",
  admin: {
    useAsTitle: "firstName",
  },
  // versions: true,
  fields: [
    {
      name: "user",
      type: "relationship",
      required: true,
      relationTo: "users",
    },
    {
      name: "firstName",
      type: "text",
      required: true,
      label: "First Name",
    },
    {
      name: "lastName",
      type: "text",
      required: true,
      label: "Last Name",
    },
    {
      name: "phoneNumber",
      type: "text",
      required: true,
      label: "Phone Number",
    },
    {
      name: "email",
      type: "email",
      required: true,
      label: "Email Address",
    },
    {
      name: "shippingAddress",
      type: "text",
      required: true,
      label: "Shipping Address",
    },
    {
      name: "governmentId",
      type: "group",
      label: "Government-issued ID",
      fields: [
        {
          name: "front",
          type: "upload",
          required: true,
          label: "Front of ID",
          relationTo: "media",
        },
        {
          name: "back",
          type: "upload",
          required: true,
          label: "Back of ID",
          relationTo: "media",
        },
      ],
    },
  ],
};

export default IdentityVerification;
