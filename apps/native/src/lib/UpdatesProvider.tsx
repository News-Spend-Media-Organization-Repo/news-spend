import {
  channel,
  reloadAsync,
  useUpdates as useExpoUpdates,
} from "expo-updates";
import { useEffect } from "react";

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

  useEffect(() => {
    if (isUpdatePending && downloadedUpdate) {
      reloadAsync();
    }
  }, [isUpdatePending, downloadedUpdate]);

  useEffect(() => {
    if (isUpdateAvailable && availableUpdate && !isDevelopmentBuild) {
      showUpdateModal();
    }
  }, [isUpdateAvailable, availableUpdate, isDevelopmentBuild, showUpdateModal]);

  return {
    UpdateModalComponent,
    isUpdateAvailable,
    isUpdatePending,
    isDevelopmentBuild,
  };
};
