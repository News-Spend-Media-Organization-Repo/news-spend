import {
  channel,
  checkForUpdateAsync,
  reloadAsync,
  useUpdates as useExpoUpdates,
} from "expo-updates";
import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useUpdateModal } from "#/components/UpdateModal";

export const useUpdates = () => {
  const {
    availableUpdate,
    isUpdateAvailable,
    isUpdatePending,
    downloadedUpdate,
  } = useExpoUpdates();

  const { showUpdateModal, UpdateModalComponent } = useUpdateModal();

  const isDevelopmentBuild = channel === null;

  // Track whether the initial check has completed so we don't
  // double-fire the modal on first appState change to "active".
  const initialCheckDone = useRef(false);

  useEffect(() => {
    if (isUpdatePending && downloadedUpdate) {
      reloadAsync();
    }
  }, [isUpdatePending, downloadedUpdate]);

  useEffect(() => {
    if (isUpdateAvailable && availableUpdate && !isDevelopmentBuild) {
      showUpdateModal();
      initialCheckDone.current = true;
    }
  }, [isUpdateAvailable, availableUpdate, isDevelopmentBuild, showUpdateModal]);

  // When the app comes to the foreground, check for updates.
  // ON_LOAD only fires on cold start — this covers users who keep
  // the app open for hours/days.
  const handleAppStateChange = useCallback(
    (nextState: AppStateStatus) => {
      if (
        nextState === "active" &&
        !isDevelopmentBuild &&
        initialCheckDone.current
      ) {
        checkForUpdateAsync().catch(() => {
          // Silently ignore — network failures are expected.
        });
      }
    },
    [isDevelopmentBuild]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription.remove();
  }, [handleAppStateChange]);

  return {
    UpdateModalComponent,
    isUpdateAvailable,
    isUpdatePending,
    isDevelopmentBuild,
  };
};
