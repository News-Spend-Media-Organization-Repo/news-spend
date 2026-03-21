import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { nestedDocsPlugin } from "@payloadcms/plugin-nested-docs";
import { redirectsPlugin } from "@payloadcms/plugin-redirects";
import { sentryPlugin } from "@payloadcms/plugin-sentry";
import { seoPlugin } from "@payloadcms/plugin-seo";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig, type Config, deepMerge } from "payload";
import sharp from "sharp";

import { TwitterBlock } from "./blocks";
import { InstagramBlock } from "./blocks/Instagram/config";
import { YouTubeBlock } from "./blocks/YouTube/config";
import {
  Account,
  Activities,
  Categories,
  Comments,
  ContentReport,
  Feedback,
  IdentityVerification,
  Lotteries,
  LotteryTickets,
  LotteryWinners,
  NotificationDeliveries,
  NotificationInbox,
  Notifications,
  PartnerContent,
  PartnerConversions,
  Partners,
  PromotionMedia,
  PushTokens,
  Reactions,
  Session,
  ShopAnalytics,
  Survey,
  TicketPurchaseLog,
  Users,
  Verification,
  WitnessReport,
} from "./collections";
import Admins from "./collections/Admins";
import { Media } from "./collections/Media";
import News from "./collections/News";
import NewsCategory from "./globals/NewsCategory";
import { migrations } from "./migrations";
import { nestedDocsPlusPlugin } from "./plugins/nestedDocsPlusPlugin";
import { checkPushReceiptsTask } from "./tasks/checkPushReceipts";
import { cleanupAnonymousUsersTask } from "./tasks/cleanupAnonymousUsers";
import { processLotteryTask } from "./tasks/processLottery";
import { sendScheduledNotificationTask } from "./tasks/sendScheduledNotification";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const baseConfig: Config = {
  cors: "*",
  admin: {
    user: Admins.slug,
    meta: {
      title: "News Spend Media CMS",
      description:
        "Read news, earn points, join our community and stay updated on the latest news and trends.",
      titleSuffix: " - News Spend Media",
      icons: [
        {
          rel: "icon",
          type: "image/png",
          url: "/images/logo.png",
        },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    ...(process.env.NODE_ENV === "development" &&
      {
        // autoLogin: {
        //   email: 'admin@newsspend.com',
        //   password: 'admin',
        // },
      }),
    components: {
      graphics: {
        Logo: "@news-spend-media/payload/components/Logo#Logo",
        Icon: "@news-spend-media/payload/components/Icon#Icon",
      },
    },
  },
  blocks: [InstagramBlock, YouTubeBlock, TwitterBlock],
  globals: [NewsCategory],
  collections: [
    Account,
    Activities,
    Admins,
    // Ads,
    // Apps,
    Categories,
    Comments,
    ContentReport,
    Feedback,
    // Games,
    IdentityVerification,
    Lotteries,
    LotteryTickets,
    LotteryWinners,
    Media,
    News,
    NotificationDeliveries,
    NotificationInbox,
    Notifications,
    PartnerContent,
    PartnerConversions,
    Partners,
    PromotionMedia,
    PushTokens,
    Reactions,
    Session,
    ShopAnalytics,
    // Stores,
    Survey,
    TicketPurchaseLog,
    Users,
    Verification,
    WitnessReport,
    // VerificationOTP,
    // UserSegment,
  ],
  editor: lexicalEditor(),
  jobs: {
    tasks: [
      sendScheduledNotificationTask,
      checkPushReceiptsTask,
      processLotteryTask,
      cleanupAnonymousUsersTask,
    ],
    autoRun: [
      {
        cron: "*/5 * * * *",
        queue: "default",
        limit: 10,
      },
      {
        cron: "0 0,12 * * *",
        queue: "maintenance",
        limit: 10,
      },
    ],
  },
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || "",
    },
    idType: "uuid",
    prodMigrations: migrations,
  }),
  sharp,
  upload: {
    debug: process.env.NODE_ENV === "development",
  },
  plugins: [
    sentryPlugin({
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    }),
    seoPlugin({}),
    nestedDocsPlusPlugin({
      collections: ["categories"],
    }),
    nestedDocsPlugin({
      collections: ["categories"],
    }),
    redirectsPlugin({
      collections: ["news"],
    }),
  ],
  onInit: async (payload) => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }
    const existingUsers = await payload.find({
      collection: "admins",
      limit: 1,
    });

    if (existingUsers.docs.length === 0) {
      await payload.create({
        collection: "admins",
        data: {
          email: "admin@newsspend.com",
          password: "admin",
          role: "super-admin",
          fullName: "Super Admin",
        },
      });
    }
  },
};

export const configurePayload = (overrides?: Partial<Config>) =>
  buildConfig(deepMerge(baseConfig, overrides ?? {}));
