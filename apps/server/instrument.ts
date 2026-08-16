import { ORPCInstrumentation } from "@orpc/opentelemetry";
// @sentry/bun, not @sentry/node: the server runs on Bun.serve, and only the Bun
// SDK carries the runtime-specific fetch/serve instrumentation and async-context
// handling. It re-exports @sentry/node and shares the same global client, so the
// `@sentry/node` imports in @news-spend-media/api still resolve to this client.
import * as Sentry from "@sentry/bun";

// Loaded via `bun --preload ./instrument.ts` (see package.json scripts) so that
// Sentry's OpenTelemetry hooks are installed before any application module is
// evaluated. Importing this from src/index.ts would be too late for the
// instrumentation to patch @orpc/server.

// Not a secret — a DSN only grants the ability to send events in. Kept as a
// fallback so a deploy that has not had SENTRY_DSN set still reports.
const FALLBACK_DSN =
  "https://d3dbe494a482913916c7bb43fa05b2bf@o4507648362938368.ingest.de.sentry.io/4511030787768400";

const dsn = process.env.SENTRY_DSN || FALLBACK_DSN;
const environment =
  process.env.APP_ENV || process.env.NODE_ENV || "development";
const isProduction = environment === "production";

// Tracing every request is affordable at current volume but is the first thing
// to turn down if the quota gets tight — hence the env override.
const tracesSampleRate = Number(
  process.env.SENTRY_TRACES_SAMPLE_RATE ?? (isProduction ? 0.2 : 1)
);

Sentry.init({
  dsn,
  // Off in local development unless explicitly opted in, so day-to-day work
  // does not pollute the production issue stream.
  enabled: isProduction || process.env.SENTRY_ENABLED === "true",
  environment,
  release: process.env.RAILWAY_GIT_COMMIT_SHA,
  sendDefaultPii: true,
  tracesSampleRate,
  openTelemetryInstrumentations: [new ORPCInstrumentation()],
  enableLogs: true,
});
