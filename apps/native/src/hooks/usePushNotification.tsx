import { useMutation } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { useSnapshot } from "valtio";

import { orpc } from "#/lib/orpc";
import { authState } from "#/state/auth";
import { storage } from "#/utils/storage";

const MAX_RETRY_COUNT = 3;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const setupAndroidChannel = async () => {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      showBadge: true,
      lightColor: "#FF231F7C",
    });
  }
};

const registerForPushNotificationsAsync = async () => {
  if (!Device.isDevice) {
    Alert.alert("Must use physical device for Push Notifications");
    return null;
  }

  await setupAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("Failed to get push token for push notification!");
    return null;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    console.warn("Failed to get project id for push notification!");
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
};

const registerWithRetry = async (retryCount = 0): Promise<string | null> => {
  try {
    return await registerForPushNotificationsAsync();
  } catch (error) {
    if (retryCount < MAX_RETRY_COUNT) {
      setTimeout(() => registerWithRetry(retryCount + 1), 1000);
    } else {
      console.error("Error registering for push notifications:", error);
    }
    return null;
  }
};

const usePushNotification = () => {
  const authSnapshot = useSnapshot(authState);
  const { user } = authSnapshot;
  const { mutate: saveToken } = useMutation(
    orpc.account.createPushToken.mutationOptions()
  );

  const notificationListener = useRef<Notifications.EventSubscription>(null);
  const responseListener = useRef<Notifications.EventSubscription>(null);

  const registerToken = useCallback(async () => {
    if (!user) {
      console.log("Not ready for token registration yet");
      return;
    }

    console.log("Starting token registration...");
    const token = await registerWithRetry();
    const existingToken = storage.getString("pushToken");

    if (!token || token === existingToken) {
      console.log("No new token to register");
      return;
    }

    storage.set("pushToken", token);

    // Save to your backend
    saveToken(
      {
        token,
        // appVersion: Application.nativeApplicationVersion || "",
        deviceModel: Device.modelName ?? "",
        deviceName: Device.deviceName ?? "",
        deviceType:
          Platform.select({
            ios: "ios",
            android: "android",
          }) || "web",
        // deviceOsVersion: Device.osVersion,
      },
      {
        onError: (error) => console.error("Error saving token:", error),
        onSuccess: () => console.log("Token saved successfully"),
      }
    );
  }, [user, saveToken]);

  useEffect(() => {
    const tokenRegistrationTimeout = setTimeout(registerToken, 5000);

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("Notification received:", notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("Notification response:", response);
      });

    return () => {
      clearTimeout(tokenRegistrationTimeout);
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [registerToken]);

  const sendPushNotification = useCallback(async (expoPushToken: string) => {
    const message = {
      to: expoPushToken,
      sound: "default",
      title: "Original Title",
      body: "And here is the body!",
      data: { url: "https://csb-9i1lhi-lac.vercel.app/" },
    };

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  }, []);

  return { sendPushNotification };
};

export default usePushNotification;
