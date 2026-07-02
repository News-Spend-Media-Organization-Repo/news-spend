import contract from "@news-spend-media/api/contract.json";
import type { router } from "@news-spend-media/api/router/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import type {
  InferRouterInputs,
  InferRouterOutputs,
  RouterClient,
} from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { getBaseUrl } from "#/utils/getBaseUrl";

import { authClient } from "./authClient";

const url = getBaseUrl();
const link = new RPCLink({
  url: `${url}/rpc`,
  headers: () => {
    const headers = new Map<string, string>();
    const cookies = authClient.getCookie();
    if (cookies) {
      headers.set("Cookie", cookies);
    }
    return Object.fromEntries(headers);
  },
  interceptors: [
    // onError((error) => {
    //   console.error("error", error);
    // }),
  ],
  plugins: [
    new BatchLinkPlugin({
      groups: [
        {
          condition: (_options) => true,
          context: {}, // Context used for the rest of the request lifecycle
        },
      ],
      mode: __DEV__ ? "buffered" : "streaming",
      exclude: ({ path }) => ["publisher/onMessage"].includes(path.join("/")),
    }),
  ],
});

const openapiLink = new OpenAPILink(contract as unknown as typeof router, {
  url: `${url}/api`,
  headers: () => {
    const headers = new Map<string, string>();
    const cookies = authClient.getCookie();
    if (cookies) {
      headers.set("Cookie", cookies);
    }
    return Object.fromEntries(headers);
  },
  // interceptors: [
  //   onError((error) => {
  //     console.error("interceptor error", error);
  //   }),
  // ],
});

export const client: RouterClient<typeof router> = createORPCClient(link);
export const openapiClient: JsonifiedClient<
  // @ts-expect-error
  ContractRouterClient<typeof contract>
> = createORPCClient(openapiLink);

export const orpc = createTanstackQueryUtils(client);
export const openapi = createTanstackQueryUtils(openapiClient);

export type RouterOutputs = InferRouterOutputs<typeof router>;
export type RouterInputs = InferRouterInputs<typeof router>;
