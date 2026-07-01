import "dotenv/config";
import { createContext } from "@news-spend-media/api/context";
import { router } from "@news-spend-media/api/router/index";
import { auth } from "@news-spend-media/auth";
import { logger as appLogger } from "@news-spend-media/logger";
// import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { RatelimitHandlerPlugin } from "@orpc/experimental-ratelimit";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

import { AccountDeletionPage } from "./pages/AccountDeletion";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";

const logger = appLogger;

const CORS_ORIGINS = [
  process.env.CORS_ORIGIN || "",
  "http://localhost:9000",
  "http://cms.newsspend.localhost:1355",
  "http://server.newsspend.localhost:1355",
  "https://staging-cms.newsspend.com",
  "https://cms.newsspend.com",
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
    // new LoggingHandlerPlugin({
    //   logger,
    //   logRequestResponse: true,
    // }),
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
      logger.error({ err: error }, "API handler error");
    }),
  ],
});

async function handleApi(req: Request) {
  const origin = req.headers.get("origin");
  const context = await createContext({ request: req });
  const result = await apiHandler.handle(req, { prefix: "/api", context });
  if (result.matched) {
    return new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers: {
        ...Object.fromEntries(result.response.headers.entries()),
        ...getCorsHeaders(origin),
      },
    });
  }
  return new Response("Not Found", { status: 404 });
}

export const rpcHandler = new RPCHandler(router, {
  plugins: [
    new BatchHandlerPlugin(),
    new RatelimitHandlerPlugin(),
    // new LoggingHandlerPlugin({
    //   logger,
    //   logRequestResponse: true,
    // }),
  ],
  interceptors: [
    onError((error) => {
      logger.error({ err: error }, "RPC handler error");
    }),
  ],
});

async function handleRpc(req: Request) {
  const origin = req.headers.get("origin");
  const context = await createContext({ request: req });
  const result = await rpcHandler.handle(req, { prefix: "/rpc", context });
  if (result.matched) {
    return new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers: {
        ...Object.fromEntries(result.response.headers.entries()),
        ...getCorsHeaders(origin),
      },
    });
  }
  return new Response("Not Found", { status: 404 });
}

function isCorsOriginAllowed(origin: string | null): boolean {
  if (!origin) {
    return true;
  }
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

function logRequest(req: Request) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const msg = `${timestamp} -> ${req.method} ${new URL(req.url).pathname}`;
  logger.info(msg);
}

function logResponse(req: Request, status: number, elapsed: number) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const arrow = status >= 400 ? "<" : "<-";
  const msg = `${timestamp} ${arrow} ${req.method} ${new URL(req.url).pathname} ${status} ${elapsed}ms`;
  if (status >= 500) {
    logger.error(msg);
  } else if (status >= 400) {
    logger.warn(msg);
  } else {
    logger.info(msg);
  }
}

const staticRoutes = {
  "/": () => new Response("OK"),

  "/health": () =>
    Response.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    }),

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
};

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",

  fetch(req) {
    const start = Date.now();
    const url = new URL(req.url);
    const origin = req.headers.get("origin");

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    const staticHandler =
      staticRoutes[url.pathname as keyof typeof staticRoutes];
    if (staticHandler) {
      logRequest(req);
      const res = staticHandler();
      logResponse(req, res.status, Date.now() - start);
      return res;
    }

    if (url.pathname.startsWith("/api/auth/")) {
      logRequest(req);
      const handler = async () => {
        const expoOrigin = req.headers.get("expo-origin");
        const authRequest = expoOrigin
          ? new Request(req, {
              headers: {
                ...Object.fromEntries(req.headers),
                origin: expoOrigin,
              },
            })
          : req;
        const authResponse = await auth.handler(authRequest);
        const corsResponse = new Response(authResponse.body, authResponse);
        for (const [key, value] of Object.entries(getCorsHeaders(origin))) {
          corsResponse.headers.set(key, value);
        }
        return corsResponse;
      };

      return handler().then((res) => {
        logResponse(req, res.status, Date.now() - start);
        return res;
      });
    }

    if (url.pathname === "/rpc" || url.pathname.startsWith("/rpc/")) {
      logRequest(req);
      return handleRpc(req).then((res) => {
        logResponse(req, res.status, Date.now() - start);
        return res;
      });
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      logRequest(req);
      return handleApi(req).then((res) => {
        logResponse(req, res.status, Date.now() - start);
        return res;
      });
    }

    logRequest(req);
    logResponse(req, 404, Date.now() - start);
    return new Response("Not Found", { status: 404 });
  },

  error(error) {
    logger.error({ err: error }, "Server error");
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
