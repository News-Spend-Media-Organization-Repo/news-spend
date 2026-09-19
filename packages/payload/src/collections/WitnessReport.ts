import type { CollectionConfig } from "payload";

import { isStaff } from "../access/adminRoles";
import { notifyAdminsOnWitnessReport } from "../hooks/witnessReport/notifyAdmins";

const WitnessReport: CollectionConfig = {
  slug: "witness-reports",
  admin: {
    useAsTitle: "title",
  },
  // Holds the reporter's name and account of what they saw, so it is not
  // public. Reports arrive through the API server's local API, which skips
  // access rules; this used to be open to anyone, which let a caller read
  // every report and file new ones, each of which emails every admin.
  access: {
    read: isStaff,
    create: () => false,
  },
  hooks: {
    afterChange: [notifyAdminsOnWitnessReport],
  },
  fields: [
    {
      name: "name",
      label: "Reporter's Name",
      type: "text",
      required: true,
    },
    {
      name: "title",
      label: "Report Title",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "text",
    },
    {
      name: "reportType",
      type: "select",
      defaultValue: "shortMessage",
      options: [
        { label: "Short Message", value: "shortMessage" },
        { label: "Video", value: "video" },
        { label: "Picture", value: "picture" },
      ],
    },
    {
      name: "files",
      type: "relationship",
      required: true,
      hasMany: true,
      relationTo: "media",
    },
    // {
    //   name: "video",
    //   type: "blocks",
    //   blocks: [
    //     {
    //       type: "",
    //       fields: [
    //         {
    //           name: "muxAssetId",
    //           type: "text",
    //           label: "Mux Video Asset ID",
    //         },
    //         {
    //           name: "type",
    //           type: "select",
    //           label: "Video Type",
    //           defaultValue: "mux",
    //           options: [{ label: "Mux", value: "mux" }],
    //         },
    //       ],
    //     },
    //   ],
    // },
    // {
    //   name: "pictures",
    //   type: "array",

    // }
  ],
};

export default WitnessReport;
