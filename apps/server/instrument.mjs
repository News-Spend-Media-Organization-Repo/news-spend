import { httpInstrumentationMiddleware } from "@hono/otel";
import { ORPCInstrumentation } from "@orpc/otel";
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://d3dbe494a482913916c7bb43fa05b2bf@o4507648362938368.ingest.de.sentry.io/4511030787768400",
  sendDefaultPii: true,
  tracesSampleRate: 1,
  environment: process.env.APP_ENV || "development",
  openTelemetryInstrumentations: [
    new ORPCInstrumentation(),
    // @ts-expect-error - httpInstrumentationMiddleware type
    httpInstrumentationMiddleware({
      serviceName: "news-spend-server",
      serviceVersion: "1.0.0",
    }),
  ],
  enableLogs: true,
});
