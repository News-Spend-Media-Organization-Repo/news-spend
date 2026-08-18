import contract from "@news-spend-media/api/contract.json";
import type { router } from "@news-spend-media/api/router/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import {
  RetryLinkPlugin,
  type RetryLinkPluginContext,
} from "@orpc/client/plugins";
import type { RouterContractClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi";
import { OpenAPILink } from "@orpc/openapi/fetch";
import type {
  InferRouterInputs,
  InferRouterOutputs,
  RouterClient,
} from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { getBaseUrl } from "#/utils/getBaseUrl";
import { isNetworkError } from "#/utils/isNetworkError";

import { authClient } from "./authClient";

interface ORPCClientContext extends RetryLinkPluginContext {}

const url = getBaseUrl();

const retryPlugin = new RetryLinkPlugin<ORPCClientContext>({
  default: {
    retry: 3,
    retryDelay: 1000, // 1 second base delay
    shouldRetry: ({ error }) => isNetworkError(error),
  },
});

const link = new RPCLink<ORPCClientContext>({
  origin: url,
  url: "/rpc",
  headers: () => {
    const headers = new Map<string, string>();
    const cookies = authClient.getCookie();
    if (cookies) {
      headers.set("Cookie", cookies);
    }
    return Object.fromEntries(headers);
  },
  plugins: [retryPlugin],
});

const openapiLink = new OpenAPILink<ORPCClientContext>(
  contract as unknown as typeof router,
  {
    origin: url,
    url: "/api",
    headers: () => {
      const headers = new Map<string, string>();
      const cookies = authClient.getCookie();
      if (cookies) {
        headers.set("Cookie", cookies);
      }
      return Object.fromEntries(headers);
    },
    plugins: [retryPlugin],
  }
);

export const client: RouterClient<typeof router, ORPCClientContext> =
  createORPCClient(link);
export const openapiClient: JsonifiedClient<
  RouterContractClient<typeof contract>
> = createORPCClient(openapiLink);

export const orpc = createTanstackQueryUtils(client);
export const openapi = createTanstackQueryUtils(openapiClient);

export type RouterOutputs = InferRouterOutputs<typeof router>;
export type RouterInputs = InferRouterInputs<typeof router>;
