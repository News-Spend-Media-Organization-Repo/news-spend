import { expoClient } from "@better-auth/expo/client";
import type { auth } from "@news-spend-media/auth";
import {
  anonymousClient,
  emailOTPClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { getBaseUrl } from "#/utils/getBaseUrl";
import { storage } from "#/utils/storage";

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  disableDefaultFetchPlugins: true,
  // disableCache: true,
  plugins: [
    inferAdditionalFields<typeof auth>(),
    expoClient({
      scheme: "news-spend",
      storagePrefix: "expo-better-auth",
      storage: {
        getItem(key) {
          return storage.getString(key) ?? null;
        },
        setItem(key, value) {
          return storage.set(key, value);
        },
      },
    }),
    emailOTPClient(),
    anonymousClient(),
  ],
});
