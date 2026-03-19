import { serve } from "@hono/node-server";
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
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { AccountDeletionPage } from "./pages/AccountDeletion";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: [
      process.env.CORS_ORIGIN || "",
      "http://localhost:9000",
      "http://cms.newsspend.localhost:1355",
      "http://server.newsspend.localhost:1355",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

function withExpoOrigin(request: Request): Request {
  const expoOrigin = request.headers.get("expo-origin");
  if (!expoOrigin) {
    return request;
  }

  const newHeaders = new Headers(request.headers);
  newHeaders.set("origin", expoOrigin);

  return new Request(request, { headers: newHeaders });
}

app.on(["POST", "GET"], "/api/auth/*", (c) =>
  auth.handler(withExpoOrigin(c.req.raw))
);

const BODY_PARSER_METHODS = new Set([
  "arrayBuffer",
  "blob",
  "formData",
  "json",
  "text",
] as const);

type BodyParserMethod =
  typeof BODY_PARSER_METHODS extends Set<infer T> ? T : never;

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

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const request = new Proxy(c.req.raw, {
    get(target, prop) {
      if (BODY_PARSER_METHODS.has(prop as BodyParserMethod)) {
        return () => c.req[prop as BodyParserMethod]();
      }
      return Reflect.get(target, prop, target);
    },
  });

  const apiResult = await apiHandler.handle(request, {
    prefix: "/api",
    context,
  });

  if (apiResult.matched) {
    return new Response(apiResult.response.body, {
      status: apiResult.response.status,
      statusText: apiResult.response.statusText,
      headers: apiResult.response.headers,
    });
  }

  await next();
});

app.get("/", (c) => c.text("OK"));

app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  })
);

app.get("/account-deletion", (c) => c.html(AccountDeletionPage()));
app.get("/delete-account", (c) => c.html(AccountDeletionPage()));

app.get("/privacy-policy", (c) => c.html(PrivacyPolicy()));

const port = Number(process.env.PORT) || 9000;
const hostname = "0.0.0.0";

const server = serve({
  fetch: app.fetch,
  port,
  hostname,
});

appLogger.info({ port, hostname }, "Server is running");

// initialize redis and cron jobs (best-effort)
try {
  if (process.env.REDIS_URL) {
    // lazy import to avoid module cycles in dev
    import("@news-spend-media/api/lib/redis").then(({ getRedis }) => {
      try {
        getRedis();
      } catch (e) {
        // noop
      }
    });
  }
  import("@news-spend-media/api/jobs/trending").then((m) => {
    try {
      m.startTrendingJob();
    } catch (e) {
      // noop
    }
  });
  import("@news-spend-media/api/jobs/lottery").then((m) => {
    try {
      m.startLotteryJob();
    } catch (e) {
      // noop
    }
  });
} catch (e) {
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

process.on("SIGINT", () => {
  server.close();
  gracefulShutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close((err) => {
    gracefulShutdown().finally(() => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      process.exit(0);
    });
  });
});
