import { accountRouter } from "./account";
import { activityRouter } from "./activity";
import { adsRouter } from "./ads";
import { appSettingsRouter } from "./appSettings";
import { blockRouter } from "./block";
import { commentRouter } from "./comment";
import { discoverAnalyticsRouter } from "./discoverAnalytics";
import { eventsRouter } from "./events";
import { faqRouter } from "./faq";
import { feedbackRouter } from "./feedback";
import { forYouRouter } from "./forYou";
import { giveawayRouter } from "./giveaway";
import { newsRouter } from "./news";
import { notificationSettingsRouter } from "./notificationSettings";
import { notificationsRouter } from "./notifications";
import { partnerConversionRouter } from "./partner-conversions";
import { partnerContentRouter } from "./partnerContent";
import { partnerContentEventsRouter } from "./partnerContentEvents";
import { postReportRouter } from "./postReport";
import { publisherRouter } from "./publisher";
import { reportRouter } from "./report";
import { reviewRouter } from "./review";
import { storeRouter } from "./store";
import { surveyRouter } from "./survey";
import { tweetRouter } from "./tweet";
import { verificationRouter } from "./verification";

export const router = {
  account: accountRouter,
  activity: activityRouter,
  block: blockRouter,
  ads: adsRouter,
  appSettings: appSettingsRouter,
  comments: commentRouter,
  faq: faqRouter,
  feedback: feedbackRouter,
  forYou: forYouRouter,
  giveaway: giveawayRouter,
  discoverAnalytics: discoverAnalyticsRouter,
  events: eventsRouter,
  news: newsRouter,
  notificationSettings: notificationSettingsRouter,
  notifications: notificationsRouter,
  partnerContent: partnerContentRouter,
  partnerContentEvents: partnerContentEventsRouter,
  partnerConversions: partnerConversionRouter,
  postReport: postReportRouter,
  publisher: publisherRouter,
  report: reportRouter,
  review: reviewRouter,
  store: storeRouter,
  survey: surveyRouter,
  verification: verificationRouter,
  tweet: tweetRouter,
};

export default router;
export type { router as Router };
