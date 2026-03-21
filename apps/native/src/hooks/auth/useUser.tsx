import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { authClient } from "#/lib/authClient";
import { authState, setAuthSession } from "#/state/auth";

export const userQueryOptions = queryOptions({
  queryKey: ["account", "me"],
  queryFn: async () => {
    const { data, error } = await authClient.getSession();
    if (error) {
      throw error;
    }
    return data;
  },
  enabled: authState.session !== null,
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: true,
  refetchOnMount: false,
  meta: { persist: false },
});

export default function useUser() {
  const query = useQuery({
    ...userQueryOptions,
    placeholderData: authState.session ?? undefined,
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }

    // Sync server state back to local state if different
    if (
      !authState.session ||
      JSON.stringify(authState.session) !== JSON.stringify(query.data)
    ) {
      setAuthSession(query.data, "signIn");
    }
  }, [query.data]);

  return query;
}
