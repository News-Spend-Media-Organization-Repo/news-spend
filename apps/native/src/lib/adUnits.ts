import { Platform } from "react-native";
import { TestIds } from "react-native-google-mobile-ads";

const isTest = __DEV__;

export const adUnits = isTest
  ? {
      banner: TestIds.BANNER,
      native: TestIds.NATIVE,
      rewarded: TestIds.REWARDED,
      rewardedInterstitial: TestIds.REWARDED_INTERSTITIAL,
    }
  : {
      banner: Platform.select({
        ios: "ca-app-pub-6856140527698362/9712790368",
        android: "ca-app-pub-6856140527698362/9157799743",
      }) as string,
      native: Platform.select({
        ios: "ca-app-pub-6856140527698362/1053598928",
        android: "ca-app-pub-6856140527698362/4167760156",
      }) as string,
      rewarded: Platform.select({
        ios: "ca-app-pub-6856140527698362/6364115446",
        android: "ca-app-pub-6856140527698362/7844718073",
      }) as string,
      rewardedInterstitial: Platform.select({
        ios: "ca-app-pub-6856140527698362/3031375099",
        android: "ca-app-pub-6856140527698362/1111788762",
      }) as string,
    };
