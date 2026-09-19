import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Sample RSS/heap once per process. `register` can run more than once
    // across module graphs, so the flag keeps a single interval alive.
    const g = globalThis as typeof globalThis & {
      __cmsMemorySamplerStarted?: boolean;
    };
    if (!g.__cmsMemorySamplerStarted) {
      g.__cmsMemorySamplerStarted = true;
      const { startMemorySampling } = await import("./memory-sample");
      startMemorySampling();
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Without this, App Router server component and route handler errors are
// swallowed by Next's own error boundary and never reach Sentry.
export const onRequestError = Sentry.captureRequestError;
