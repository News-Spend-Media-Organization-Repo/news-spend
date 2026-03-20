import "dotenv/config";
import { createContext } from "@news-spend-media/api/context";
import { router } from "@news-spend-media/api/router/index";
import { auth } from "@news-spend-media/auth";
import { logger as appLogger } from "@news-spend-media/logger";
import { RatelimitHandlerPlugin } from "@orpc/experimental-ratelimit";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { AccountDeletionPage } from "./pages/AccountDeletion";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";

const CORS_ORIGINS = [
  process.env.CORS_ORIGIN || "",
  "http://localhost:9000",
  "http://cms.newsspend.localhost:1355",
  "http://server.newsspend.localhost:1355",
].filter(Boolean);

const servers: Array<{ url: string; description: string }> = [];

if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  servers.push({
    url: `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api`,
    description: process.env.RAILWAY_ENVIRONMENT || "Production",
  });
}

servers.push({
  url: `http://localhost:${process.env.PORT || 9000}/api`,
  description: "Development",
});

servers.push({
  url: "http://server.newsspend.localhost:1355/api",
  description: "Development",
});

export const apiHandler = new OpenAPIHandler(router, {
  plugins: [
    new BatchHandlerPlugin(),
    new RatelimitHandlerPlugin(),
    new OpenAPIReferencePlugin({
      docsProvider: "scalar",
      docsTitle: "OpenAPI Documentation",
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        servers,
        info: {
          title: "News Spend Media API",
          version: "1.0.0",
        },
      },
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(router, {
  plugins: [new BatchHandlerPlugin(), new RatelimitHandlerPlugin()],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

function isCorsOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  return CORS_ORIGINS.includes(origin);
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isCorsOriginAllowed(origin)
    ? origin || "*"
    : CORS_ORIGINS[0] || "*";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

const port = Number(process.env.PORT) || 9000;

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",

  routes: {
    "/": () => new Response("OK"),

    "/health": () =>
      new Response(
        JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: process.env.NODE_ENV || "development",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      ),

    "/account-deletion": () =>
      new Response(AccountDeletionPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),

    "/delete-account": () =>
      new Response(AccountDeletionPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),

    "/privacy-policy": () =>
      new Response(PrivacyPolicy(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
  },

  async fetch(req) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname.startsWith("/api/auth/")) {
      const expoOrigin = req.headers.get("expo-origin");
      const authRequest = expoOrigin
        ? new Proxy(req, {
            get(target, prop, receiver) {
              if (prop === "headers") {
                const headers = new Headers(target.headers);
                headers.set("origin", expoOrigin);
                return headers;
              }
              return Reflect.get(target, prop, receiver);
            },
          })
        : req;

      const authResponse = await auth.handler(authRequest);
      const corsResponse = new Response(authResponse.body, authResponse);
      for (const [key, value] of Object.entries(corsHeaders)) {
        corsResponse.headers.set(key, value);
      }
      return corsResponse;
    }

    if (url.pathname.startsWith("/rpc") || url.pathname.startsWith("/api")) {
      const context = await createContext({ request: req });
      const prefix = url.pathname.startsWith("/rpc") ? "/rpc" : "/api";

      const contentType = req.headers.get("content-type") || "";
      const accept = req.headers.get("accept") || "";
      const isRpcProtocol =
        contentType.includes("application/json") &&
        !accept.includes("application/json");

      if (isRpcProtocol) {
        const result = await rpcHandler.handle(req, { prefix, context });

        if (result.matched) {
          return new Response(result.response.body, {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: {
              ...Object.fromEntries(result.response.headers.entries()),
              ...corsHeaders,
            },
          });
        }
      } else {
        const result = await apiHandler.handle(req, { prefix, context });

        if (result.matched) {
          return new Response(result.response.body, {
            status: result.response.status,
            statusText: result.response.statusText,
            headers: {
              ...Object.fromEntries(result.response.headers.entries()),
              ...corsHeaders,
            },
          });
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  error(error) {
    console.error("Server error:", error);
    return new Response("Internal Server Error", { status: 500 });
  },
});

appLogger.info(
  { port: server.port, hostname: server.hostname },
  "Server is running"
);

// initialize redis and cron jobs (best-effort)
try {
  if (process.env.REDIS_URL) {
    import("@news-spend-media/api/lib/redis").then(({ getRedis }) => {
      try {
        getRedis();
      } catch {
        // noop
      }
    });
  }
  import("@news-spend-media/api/jobs/trending").then((m) => {
    try {
      m.startTrendingJob();
    } catch {
      // noop
    }
  });
  import("@news-spend-media/api/jobs/lottery").then((m) => {
    try {
      m.startLotteryJob();
    } catch {
      // noop
    }
  });
} catch {
  // noop
}

// graceful shutdown
async function gracefulShutdown() {
  try {
    const { disconnectRedis } = await import("@news-spend-media/api/lib/redis");
    await disconnectRedis();
  } catch {
    // redis may not have been initialized
  }
}

process.on("SIGINT", async () => {
  await server.stop();
  gracefulShutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", async () => {
  await server.stop();
  gracefulShutdown().finally(() => process.exit(0));
});
