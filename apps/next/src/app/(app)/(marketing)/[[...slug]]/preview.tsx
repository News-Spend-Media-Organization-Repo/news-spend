"use client";

import { env } from "@local/env/payload";
import { RefreshRouteOnSave } from "@payloadcms/live-preview-react";
import { useRouter } from "next/navigation";
import type { FC } from "react";

export const Preview: FC = () => {
  const router = useRouter();

  return (
    <RefreshRouteOnSave
      refresh={() => {
        router.refresh();
      }}
      serverURL={env.NEXT_PUBLIC_PAYLOAD_URL}
    />
  );
};
