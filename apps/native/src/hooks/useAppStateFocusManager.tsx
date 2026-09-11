import { focusManager } from "@tanstack/react-query";
import * as React from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

/**
 * Teaches React Query what "focus" means on React Native, where there is no
 * browser window to emit its own focus event.
 *
 * Every active query defaults to `refetchOnWindowFocus: true`, which without
 * this listener never fires on native. With it, backgrounding and reopening
 * the app refetches any currently-observed query whose own `staleTime` has
 * elapsed — the same staleness check every query already applies to a plain
 * remount, just re-triggered by app foreground instead.
 */
export function useAppStateFocusManager() {
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, []);
}
