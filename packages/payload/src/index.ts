// Main config and types

export type { Config } from "payload";
// Access control policies
export * from "./access";
// Blocks
// export * from "./blocks";
// Collections (named exports to avoid conflicts)
export {
  Account,
  Activities,
  Admins,
  Apps,
  Categories,
  Comments,
  ContentReport,
  Feedback,
  Games,
  IdentityVerification,
  Lotteries,
  LotteryTickets,
  LotteryWinners,
  Media,
  News,
  NewsCategory,
  NOTIFICATION_TYPES,
  NotificationDeliveries,
  NotificationInbox,
  Notifications,
  PartnerContent,
  Partners,
  PromotionMedia,
  PushTokens,
  Reactions,
  Session,
  Stores,
  Survey,
  TicketPurchaseLog,
  Users,
  Verification,
  WitnessReport,
} from "./collections";
export { configurePayload } from "./configure-payload";
// Fields
export * from "./fields";
// Hooks
export * from "./hooks";
export { getPayload } from "./lib/getPayload";
// Re-export generated types separately (avoid naming conflicts)
export type * from "./payload-types";
// Utils
export * from "./utils";
