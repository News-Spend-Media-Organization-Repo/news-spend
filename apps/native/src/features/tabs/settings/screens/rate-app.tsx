import React from "react";
import { Linking } from "react-native";
import { Paragraph, Stack } from "tamagui";

import useAppReview from "#/hooks/useReviewApp";

const RateAppScreen = () => {
  const { onReview } = useAppReview();
  const handleRateApp = async () => {
    // Open the app store page for the app
    const url =
      "https://play.google.com/store/apps/details?id=com.newsspend.app";
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      // Give the user 50 credits after rating
      // This could be done through an API call to your backend
      // or by storing the credits locally and syncing with the backend later
      // depending on your app's architecture
      // For the sake of this example, we'll just log a message
      console.log("User has earned 50 credits for rating the app");
      alert("You have earned 50 credits for rating the app!");
    } else {
      console.log(`Don't know how to open this URL: ${url}`);
    }
  };

  return (
    <Stack flex={1} bg="$background">
      <Stack px="$3">
        <Paragraph>Rate our app and earn 50 points</Paragraph>
        {/* Work in progress. App has not been published yet */}
      </Stack>
    </Stack>
  );
};

export default RateAppScreen;
