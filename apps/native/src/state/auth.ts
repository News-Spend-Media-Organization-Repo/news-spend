import * as Sentry from "@sentry/react-native";
import { proxy, subscribe } from "valtio";

import { authClient } from "#/lib/authClient";
import { queryClient } from "#/lib/tanstackQuery";
import { storage } from "#/utils/storage";

import { releaseAudioPlaylist, setupAudio } from "./audioPlayerState";
import { routeState } from "./route-state";

const initialAuthState = {
  session: null,
  user: null,
  status: "idle" as "idle" | "signIn" | "signOut",
  isHydrating: false,
};

const storedAuthState = JSON.parse(
  storage.getString("AUTH_STATE") ?? JSON.stringify(initialAuthState),
);

export const authState = proxy<{
  session: typeof authClient.$Infer.Session | null;
  user: (typeof authClient.$Infer.Session)["user"] | null;
  status: "idle" | "signIn" | "signOut";
  isHydrating: boolean;
}>({
  ...storedAuthState,
  // Always start as idle so the app waits for hydrateAuth to verify the session
  status: "idle",
  isHydrating: false,
});

// Helper getters
export const isLoggedIn = () => authState.session?.user !== null;
export const isAnonymous = () => authState.user?.isAnonymous === true;

export const setAuthSession = (
  session: typeof authClient.$Infer.Session | null,
  status: "signIn" | "signOut",
) => {
  authState.session = session;
  authState.user = session?.user || null;
  authState.status = status;
};

export const hydrateAuth = async () => {
  authState.isHydrating = true;

  for (let attempts = 0; attempts < 3; attempts++) {
    try {
      const session = await authClient.getSession();

      console.log("Session data:", JSON.stringify(session, null, 2));
      if (session.data?.user) {
        const user = session.data.user;
        console.log("User found:", {
          id: user.id,
          email: user.email,
          isAnonymous: user.isAnonymous,
          emailVerified: user.emailVerified,
        });

        // Block unverified non-anonymous users from accessing the app
        if (!(user.emailVerified || user.isAnonymous)) {
          console.log("User email not verified, signing out");
          authState.session = null;
          authState.user = null;
          authState.status = "signOut";
          authState.isHydrating = false;
          return;
        }

        authState.session = session.data;
        authState.user = user;
        authState.status = "signIn";

        setupAudio();
        authState.isHydrating = false;
      } else {
        console.log("No user found in session");
        authState.session = null;
        authState.user = null;
        authState.status = "signOut";
        authState.isHydrating = false;
      }
      return;
    } catch (error) {
      console.error(`Hydrate attempt ${attempts + 1} failed:`, error);
      // retry
    }
  }

  // if all attempts failed
  console.error("All hydration attempts failed");
  authState.session = null;
  authState.user = null;
  authState.status = "signOut";
  authState.isHydrating = false;
};

export const logout = async () => {
  try {
    if (authState.session?.user) {
      const pushToken = storage.getString("pushToken");
      const { data, error } = await authClient.signOut({
        fetchOptions: {
          // @ts-expect-error
          body: {
            pushToken,
          },
          onSuccess(context) {
            authState.session = null;
            authState.status = "signOut";
            authState.user = null;
          },
        },
      });
      if (error) {
        throw error;
      }
    }
    setTimeout(() => {
      queryClient.clear();
      queryClient.removeQueries();
    }, 1500);
    storage.remove("NAVIGATION_STATE_V1");
  } catch (error) {
    console.log(error);
    // toast.error("Logout Failed", {
    //   description: `An error occurred while logging out`,
    // });
  } finally {
    releaseAudioPlaylist();
    authState.session = null;
    authState.user = null;
    authState.status = "signOut";
    routeState.reactNavTabName = undefined;
    storage.remove("pushToken");
  }
};

subscribe(authState, () => {
  storage.set("AUTH_STATE", JSON.stringify(authState));

  if (authState.session?.user) {
    Sentry.setUser({
      id: authState.session.user.id,
      isAnonymous: isAnonymous(),
      email: authState.session.user.email,
      // username: authState.session.user.username,
      ip_address: "{{auto}}",
    });
    const { id, createdAt, updatedAt, ...rest } = authState.session.user;
  } else {
    Sentry.setUser(null);
  }
});
