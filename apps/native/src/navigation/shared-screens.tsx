import { createNativeStackScreen } from "@react-navigation/native-stack";

import PrivacyPolicy from "#/features/auth/screens/privacy-policy";
import TermOfUse from "#/features/auth/screens/term-of-use";
import Activities from "#/features/tabs/settings/screens/activities";
import BlockedUsers from "#/features/tabs/settings/screens/blocked-users";
import DataManager from "#/features/tabs/settings/screens/data-manager";
import DeleteAccount from "#/features/tabs/settings/screens/delete-account";
import LegalAgreement from "#/features/tabs/settings/screens/legal";
import Notifications from "#/features/tabs/settings/screens/notification";
import Profile from "#/features/tabs/settings/screens/profile";
import RateAppScreen from "#/features/tabs/settings/screens/rate-app";
import Report from "#/features/tabs/settings/screens/report";
import ShareApp from "#/features/tabs/settings/screens/share-app";
import Socials from "#/features/tabs/settings/screens/socials";
import Advertise from "#/features/tabs/settings/screens/support/advertise";
import Call from "#/features/tabs/settings/screens/support/call";
import Email from "#/features/tabs/settings/screens/support/email";
import FAQs from "#/features/tabs/settings/screens/support/faqs";
import Feedback from "#/features/tabs/settings/screens/support/feedback";
import Support from "#/features/tabs/settings/screens/support/support";
import VerifyIdentity from "#/features/tabs/settings/screens/verify-identity";
import ShopDetails from "#/features/tabs/shop/screens/ShopDetails";
import SurveyWebView from "#/screens/common/SurveyWebView";
import NotFound from "#/screens/NotFound";
import BoostLuck from "#/screens/tabs/discover/BoostLuck";
import GetTicket from "#/screens/tabs/discover/GetTicket";
import LotteryRules from "#/screens/tabs/discover/LotteryRules";
import LuckyAppWall from "#/screens/tabs/discover/LuckyAppWall";
import PlayLottery from "#/screens/tabs/discover/PlayLottery";
import CommentReplies from "#/screens/tabs/home/comments/CommentReply";
import Comments from "#/screens/tabs/home/comments/Comments";
import SingleNews from "#/screens/tabs/home/news";
import LiveCommentReply from "#/screens/tabs/live/comments/LiveCommentReply";
import LiveComments from "#/screens/tabs/live/comments/LiveComments";
import Live from "#/screens/tabs/live/Live";

export const sharedScreens = {
  News: createNativeStackScreen({
    screen: SingleNews,
    getId: ({ params }) => params?.slug,
    linking: {
      path: "/article/:slug/:id?",
    },
    options: {
      headerShown: false,
    },
  }),
  Comment: createNativeStackScreen({
    screen: Comments,
    getId: ({ params }) => params?.newsSlug,
    linking: {
      path: "/article/:newsSlug/comment",
    },
    options: {
      headerShown: false,
      // slide up from bottom
      animation: "slide_from_bottom",
    },
  }),
  CommentReply: createNativeStackScreen({
    screen: CommentReplies,
    getId: ({ params }) => params?.newsSlug,
    linking: {
      path: "/article/:newsSlug/comment/:commentId/:highlightCommentId?",
    },
    options: {
      // presentation: "modal",
      animation: "slide_from_bottom",
    },
  }),
  SingleLive: createNativeStackScreen({
    screen: Live,
    getId: ({ params }) => params?.slug,
    linking: {
      path: "/video/:slug/:id?",
    },
  }),
  LiveComment: createNativeStackScreen({
    screen: LiveComments,
    getId: ({ params }) => params?.slug,
    linking: {
      path: "/video/:slug/comment",
    },
    options: {
      headerShown: false,
      // slide up from bottom
      animation: "slide_from_bottom",
    },
  }),
  LiveCommentReply: createNativeStackScreen({
    screen: LiveCommentReply,
    getId: ({ params }) => params?.slug,
    linking: {
      path: "/video/:slug/comment/:commentId/:highlightCommentId?",
    },
    options: {
      headerShown: false,
      // presentation: "modal",
      animation: "slide_from_bottom",
    },
  }),
  ShopDetails: createNativeStackScreen({
    screen: ShopDetails,
    getId: ({ params }) => params?.slug,
    linking: {
      path: "/detail/:slug",
    },
    options: {
      headerShown: false,
    },
  }),
  Profile: createNativeStackScreen({
    screen: Profile,
    linking: {
      path: "profile",
    },
  }),
  Activities: createNativeStackScreen({
    screen: Activities,
    linking: {
      path: "activities",
    },
  }),
  BlockedUsers: createNativeStackScreen({
    screen: BlockedUsers,
    linking: {
      path: "blocked-users",
    },
  }),
  Report: createNativeStackScreen({
    screen: Report,
    linking: {
      path: "report",
    },
  }),
  Notification: createNativeStackScreen({
    screen: Notifications,
    linking: {
      path: "notification",
    },
  }),
  DataManager: createNativeStackScreen({
    screen: DataManager,
    linking: {
      path: "data-manager",
    },
  }),
  DeleteAccount: createNativeStackScreen({
    screen: DeleteAccount,
    linking: {
      path: "delete-account",
    },
  }),
  RateApp: createNativeStackScreen({
    screen: RateAppScreen,
    linking: {
      path: "rate-app",
    },
  }),
  ShareApp: createNativeStackScreen({
    screen: ShareApp,
    linking: {
      path: "share-app",
    },
  }),
  Socials: createNativeStackScreen({
    screen: Socials,
    linking: {
      path: "socials",
    },
  }),
  Support: createNativeStackScreen({
    screen: Support,
    linking: {
      path: "support",
    },
  }),
  VerifyIdentity: createNativeStackScreen({
    screen: VerifyIdentity,
    linking: {
      path: "verify-identity",
    },
  }),
  Advertise: createNativeStackScreen({
    screen: Advertise,
    linking: {
      path: "advertise",
    },
  }),
  Call: createNativeStackScreen({
    screen: Call,
    linking: {
      path: "call",
    },
  }),
  Feedback: createNativeStackScreen({
    screen: Feedback,
    linking: {
      path: "feedback",
    },
  }),
  FAQ: createNativeStackScreen({
    screen: FAQs,
    linking: {
      path: "faq",
    },
  }),
  Email: createNativeStackScreen({
    screen: Email,
    linking: {
      path: "email",
    },
  }),
  Legal: createNativeStackScreen({
    screen: LegalAgreement,
    linking: {
      path: "legal",
    },
  }),
  TermsOfUse: createNativeStackScreen({
    screen: TermOfUse,
    linking: {
      path: "terms-of-use",
    },
  }),
  PrivacyPolicy: createNativeStackScreen({
    screen: PrivacyPolicy,
    linking: {
      path: "privacy-policy",
    },
  }),
  // // Discover screens
  PlayLottery: createNativeStackScreen({
    screen: PlayLottery,
    linking: {
      path: "play-lottery",
    },
    options: {
      headerShown: false,
    },
  }),
  GetTicket: createNativeStackScreen({
    screen: GetTicket,
    linking: {
      path: "buy-ticket",
    },
    options: {
      headerShown: false,
    },
  }),
  BoostLuck: createNativeStackScreen({
    screen: BoostLuck,
    linking: {
      path: "boost-luck",
    },
    options: {
      headerShown: false,
    },
  }),
  LuckyAppWall: createNativeStackScreen({
    screen: LuckyAppWall,
    linking: {
      path: "lucky-app-wall",
    },
    options: {
      headerShown: false,
    },
  }),
  LotteryRules: createNativeStackScreen({
    screen: LotteryRules,
    linking: {
      path: "lottery-rules",
    },
    options: {
      headerShown: false,
    },
  }),
  SurveyWebView: createNativeStackScreen({
    screen: SurveyWebView,
    linking: {
      path: "survey",
    },
    options: {
      headerShown: false,
    },
  }),
  NotFound: createNativeStackScreen({
    screen: NotFound,
    linking: {
      path: "*",
    },
  }),
};
