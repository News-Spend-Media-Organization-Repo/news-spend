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
import * as Application from "expo-application";

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

/**
 * Tell the server which build is calling it.
 *
 * Sent on every request rather than recorded once at sign-in, so the server
 * can refuse a build it no longer supports before that build does anything —
 * and so "how many users are on version X" is answerable from traffic rather
 * than inferred from push tokens.
 *
 * The trigger was the oRPC v2 upgrade: the protocol changed under clients that
 * had no way to know, and their requests simply began failing. A version on
 * the request is what turns that into an answerable question.
 */
const APP_VERSION = Application.nativeApplicationVersion ?? "";

async function commonHeaders(): Promise<Record<string, string>> {
  const headers = new Map<string, string>();

  const cookies = await authClient.getCookie();
  if (cookies) {
    headers.set("Cookie", cookies);
  }
  if (APP_VERSION) {
    headers.set("x-app-version", APP_VERSION);
  }

  return Object.fromEntries(headers);
}

const link = new RPCLink<ORPCClientContext>({
  origin: url,
  url: "/rpc",
  headers: commonHeaders,
  plugins: [retryPlugin],
});

/**
 * The OpenAPI client, which reads `contract.json`, exists for one call: the
 * witness-report upload (`openapi.report.create`), which needs a multipart POST
 * to a fixed path. Everything else goes through `client` above, which takes its
 * types from the router itself and never reads the contract.
 *
 * So the contract is allowed to be out of date (it lacks giveaway and
 * verification, and still lists the removed lottery), and it should stay that
 * way unless `report.create` itself changes. Do NOT regenerate it wholesale: a
 * current export writes route metadata in a different shape (`meta["~openapi"]`
 * instead of `route`), and the committed shape is what this call works with
 * today. If another procedure ever needs this client, add its entry by hand and
 * test it against staging.
 */
const openapiLink = new OpenAPILink<ORPCClientContext>(
  contract as unknown as typeof router,
  {
    origin: url,
    url: "/api",
    headers: commonHeaders,
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
