import { createClient } from "@segment/analytics-react-native";

import { storage } from "#/utils/storage";

const mmkvStorePersistor = {
  async get<T>(key: string) {
    try {
      const value = storage.getString(key);
      if (value !== null && value !== undefined) {
        return JSON.parse(value) as unknown as T;
      }
    } catch (e) {
      console.error(e);
    }

    return undefined;
  },
  async set<T>(key: string, value: T) {
    try {
      storage.set(key, JSON.stringify(value));
    } catch (e) {
      console.error(e);
    }
  },
};

export const segmentClient = createClient({
  writeKey: process.env.EXPO_PUBLIC_SEGMENT_WRITEKEY as string,
  trackAppLifecycleEvents: true,
  storePersistor: mmkvStorePersistor,
});
