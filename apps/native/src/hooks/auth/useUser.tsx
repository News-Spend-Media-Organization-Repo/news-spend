import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSnapshot } from "valtio";

import { authClient } from "#/lib/authClient";
import { authState, setAuthSession } from "#/state/auth";

export const userQueryOptions = queryOptions({
  queryKey: ["account", "me"],
  queryFn: async () => {
    const { data, error } = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    if (error) {
      throw error;
    }
    return data;
  },
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  refetchOnMount: false,
  meta: { persist: false },
});

export default function useUser() {
  const { status, session } = useSnapshot(authState);

  const query = useQuery({
    ...userQueryOptions,
    // Run when we have cached state needing verification, or already signed in
    enabled: status === "stale" || status === "signIn",
    placeholderData: session ?? undefined,
  });

  useEffect(() => {
    if (query.isSuccess) {
      if (!query.data?.user) {
        setAuthSession(null, "signOut");
        return;
      }

      const user = query.data.user;

      // Block unverified non-anonymous users
      if (!(user.emailVerified || user.isAnonymous)) {
        setAuthSession(null, "signOut");
        return;
      }

      // Only update if something actually changed
      if (JSON.stringify(authState.session) !== JSON.stringify(query.data)) {
        setAuthSession(query.data, "signIn");
      }
    }
  }, [query.isSuccess, query.data]);

  useEffect(() => {
    if (query.isError && authState.status !== "stale") {
      // Network error: if we have cached state, stay stale
      // If we have nothing, sign out
      setAuthSession(null, "signOut");
    }
  }, [query.isError]);

  return query;
}
