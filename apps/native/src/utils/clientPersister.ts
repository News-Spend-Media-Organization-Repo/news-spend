import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
import * as Application from "expo-application";

import { storage } from "./storage";

/**
 * How long a persisted query cache may be rehydrated on launch.
 *
 * This was previously unset, so the library default (24 hours) applied and a
 * returning reader could be handed a day-old feed. The gap was invisible to
 * signed-in users, who cross an auth boundary — sign in, sign out, any 401 —
 * often enough that their cache is cleared for them, but not to a guest, who
 * has no session, can therefore never 401, and so never has the cache cleared
 * at all. Their cache simply aged in place. That is the mechanism behind
 * "news content as a guest lags like 1hr behind".
 *
 * Ten minutes bounds how old anything from disk can be, while still letting a
 * quick app restart skip the network entirely.
 */
export const PERSISTED_QUERY_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Discards the persisted cache when the app changes.
 *
 * Without this there is no way for a shipped build to say "the shape of this
 * data has changed" — the previous format is rehydrated forever. Keying on the
 * native version means every release starts from a clean cache, and a user
 * picking up an update is not reading a schema that no longer matches.
 */
export function getCacheBuster(): string {
  return (
    Application.nativeApplicationVersion ??
    Application.nativeBuildVersion ??
    "dev"
  );
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
