import {
  useNavigation,
  usePreventRemove,
  useRoute,
} from "@react-navigation/native";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import type { WebViewNavigationEvent } from "react-native-webview/lib/RNCWebViewNativeComponent";

import { ScreenHeader } from "#/components";
import { Screen } from "#/components/Screen";

export default function SurveyWebView() {
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigation = useNavigation();
  const route = useRoute();
  const webViewRef = useRef<WebView>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Lock the screen orientation to portrait when the app starts
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL);

    return () => {
      // Unlock the screen orientation when the component unmounts
      ScreenOrientation.unlockAsync();
    };
  }, []);

  useEffect(
    () => () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    },
    []
  );

  const handleNavigationStateChange = (navState: WebViewNavigationEvent) => {
    setCanGoBack(navState.canGoBack);
    setIsLoading(navState.loading);
    if (navState.loading) {
      loadingTimeoutRef.current = setTimeout(() => setIsLoading(false), 10_000);
    } else if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  };

  usePreventRemove(canGoBack === false, ({ data }) => {
    Alert.alert("Are you sure?", "You will lose the chance to earn points", [
      {
        text: "no",
        style: "cancel",
        onPress: () => {},
      },
      {
        text: "yes, leave",
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  return (
    <Screen safeAreaEdges={["bottom"]}>
      <ScreenHeader title="" />
      <WebView
        onError={() => {
          setIsLoading(false);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
        }}
        onNavigationStateChange={handleNavigationStateChange}
        ref={webViewRef}
        source={{
          uri: `${(route.params as { url: string })?.url}`,
        }}
      />
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator color="#0000ff" size="large" />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
});
