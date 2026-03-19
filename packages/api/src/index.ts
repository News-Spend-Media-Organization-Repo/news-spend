import { os } from "@orpc/server";
import * as Sentry from "@sentry/node";

import type { Context } from "./context";
import { rateLimitMiddleware } from "./lib/ratelimit";
import {
  optionalAuth,
  requireAuth,
  requireAuthNoGuest,
} from "./middlewares/auth.middleware";

export const sentryMiddleware = os.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
});

export const basicProcedure = os.$context<Context>().use(sentryMiddleware);
export const publicProcedure = basicProcedure.use(optionalAuth);
export const protectedProcedure = basicProcedure.use(requireAuth);
export const protectedNoGuestProcedure = basicProcedure.use(requireAuthNoGuest);

export const rateLimitedPublicProcedure =
  publicProcedure.use(rateLimitMiddleware);
