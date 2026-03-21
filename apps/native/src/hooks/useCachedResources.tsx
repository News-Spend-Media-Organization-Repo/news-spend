import * as Sentry from "@sentry/react-native";
import { setVideoCacheSizeAsync } from "expo-video";
import { useCallback, useEffect, useState } from "react";

import { orpc } from "#/lib/orpc";
import { storage } from "#/utils/storage";

export default function useCachedResources() {
  const [loadingComplete, setLoadingComplete] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Helper to load categories
  const loadCategories = useCallback(async (isInitialLoad = false) => {
    try {
      const categoriesResponse = await orpc.news.categories.call();

      // Update categories state
      storage.set("CATEGORIES", JSON.stringify(categoriesResponse ?? []));
      return true;
    } catch (e) {
      console.warn("Failed loading categories", e);
      Sentry.captureException(e, {
        tags: {
          isInitialLoad: isInitialLoad ? "yes" : "no",
        },
      });

      // If this is the initial load, we should rethrow to handle it specifically
      if (isInitialLoad) {
        throw e;
      }

      return false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    async function loadResourcesAndDataAsync() {
      try {
        console.log("Loading resources and data");

        await setVideoCacheSizeAsync(30 * 1024 * 1024); // Set video cache size to 30MB

        const hasLoadedCategories = storage.getBoolean("HAS_LOADED_CATEGORIES");
        console.log("Has loaded categories:", hasLoadedCategories);

        // If already loaded once, load in background. Otherwise, do blocking load with retries.
        if (hasLoadedCategories) {
          // For subsequent launches, load categories in the background
          loadCategories(false).catch((e) => {
            console.log("Background loading of categories failed:", e);
          });
        } else {
          // Set default notification settings regardless of network status
          storage.set(
            "NOTIFICATION_SETTINGS",
            JSON.stringify([
              {
                notification_type: "BREAKING_NEWS",
                user_id: null,
                is_notification_enabled: true,
              },
              {
                notification_type: "COMMENT",
                user_id: null,
                is_notification_enabled: true,
              },
              {
                notification_type: "EARNING_OPPORTUNITY",
                user_id: null,
                is_notification_enabled: false,
              },
              {
                notification_type: "MISC",
                user_id: null,
                is_notification_enabled: false,
              },
            ])
          );

          // Only mark as loaded AFTER we successfully load required data
          try {
            // For new users, we need this data, so retry if it fails
            await loadCategories(true);
            // Only set flag if we successfully load the required data
            storage.set("HAS_LOADED_CATEGORIES", true);
          } catch (e) {
            // For new users, if we're connected but can't load data, retry a few times
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              console.log(
                `Retry attempt ${retryCount} for initial categories load`
              );
              // Wait a short time before retry
              await new Promise((resolve) => setTimeout(resolve, 1000));
              await loadResourcesAndDataAsync(); // Recursive retry
              return; // Exit to avoid setting loadingComplete
            }
            // If we've exhausted retries or there's no connection, continue with default empty data
            // but don't mark as loaded so we'll try again next launch
            console.warn(
              "Could not load initial data, will try again on next launch",
              e
            );
            Sentry.captureMessage(
              "Initial categories load failed after retries",
              {
                extra: { retryCount },
              }
            );
            // Set empty defaults so the app can still function
            throw new Error("Failed to load initial data");
          }
        }
      } catch (e) {
        console.warn("Error loading cached resources", e);
        if (isMounted) {
          setError(e as Error);
        }
      } finally {
        if (isMounted) {
          setLoadingComplete(true);
          console.log("Loading complete");
        }
      }
    }

    loadResourcesAndDataAsync();

    // Cleanup flag on unmount
    return () => {
      isMounted = false;
    };
  }, [loadCategories]);

  return { loadingComplete, error };
}
