import type { CollectionConfig } from "payload";

const WitnessReport: CollectionConfig = {
  slug: "witness-reports",
  admin: {
    useAsTitle: "title",
  },
  access: {
    read: () => true,
    create: () => true,
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
