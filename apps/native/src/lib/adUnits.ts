import Constants from "expo-constants";
import { Platform } from "react-native";
import { TestIds } from "react-native-google-mobile-ads";

const appVariant = Constants.expoConfig?.extra?.variant as
  | "development"
  | "beta"
  | "preview"
  | "production"
  | undefined;

// Real ad units only in the production build; every other environment
// (development, preview, beta) serves Google's test ad units.
const isTest = __DEV__ || appVariant !== "production";

export const adUnits = isTest
  ? {
      banner: TestIds.BANNER,
      native: TestIds.NATIVE,
      rewarded: TestIds.REWARDED,
      rewardedInterstitial: TestIds.REWARDED_INTERSTITIAL,
    }
  : {
      banner: Platform.select({
        ios: "ca-app-pub-3654282727219827/3674960628",
        android: "ca-app-pub-3654282727219827/4234197972",
      }) as string,
      native: Platform.select({
        ios: "ca-app-pub-3654282727219827/2361878957",
        android: "ca-app-pub-3654282727219827/1388578173",
      }) as string,
      rewarded: Platform.select({
        ios: "ca-app-pub-3654282727219827/1197006480",
        android: "ca-app-pub-3654282727219827/2729544619",
      }) as string,
      rewardedInterstitial: Platform.select({
        ios: "ca-app-pub-3654282727219827/6477217937",
        android: "ca-app-pub-3654282727219827/4988042293",
      }) as string,
    };
