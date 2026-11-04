import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
import * as Application from "expo-application";
import * as Updates from "expo-updates";

import { QUERY_CACHE_VERSION } from "./queryCacheVersion";
import { storage } from "./storage";

/**
 * How long a persisted query cache may be rehydrated on launch.
 *
 * Ten minutes meant any cold start more than ten minutes after the last cache
 * write painted the home skeleton and waited on the network, even with a
 * perfectly good feed sitting on disk. A week lets a returning reader paint
 * the last feed immediately; anything older than `staleTime` still refetches
 * on mount, so the stale frame is a head start, not the final answer.
 *
 * Not unbounded on purpose: `getCacheBuster` discards the cache on app updates
 * and OTA shape changes, and a finite window self-heals if that is ever
 * missed.
 */
export const PERSISTED_QUERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Discards the persisted cache when the app changes.
 *
 * Without this there is no way for a shipped build to say "the shape of this
 * data has changed" — the previous format is rehydrated forever. Keying on the
 * native version means every release starts from a clean cache, and a user
 * picking up an update is not reading a schema that no longer matches.
 *
 * A JS-only OTA keeps the native version, but gets a fresh `Updates.updateId`,
 * so every OTA busts the cache on its own instead of relying on someone
 * remembering to bump QUERY_CACHE_VERSION. That string remains the fallback
 * for embedded and dev bundles, where `updateId` is null.
 */
export function getCacheBuster(): string {
  const appVersion =
    Application.nativeApplicationVersion ??
    Application.nativeBuildVersion ??
    "dev";
  return `${appVersion}:${Updates.updateId ?? QUERY_CACHE_VERSION}`;
}

export function createMMKVPersister(key = "reactQuery") {
  return {
    persistClient: (client: PersistedClient) => {
      storage.set(key, JSON.stringify(client));
    },
    restoreClient: () => {
      const cached = storage.getString(key);
      return cached ? JSON.parse(cached) : undefined;
    },
    removeClient: () => {
      storage.remove(key);
    },
  } satisfies Persister;
}
