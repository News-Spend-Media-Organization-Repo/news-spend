import { ORPCError, os } from "@orpc/server";

import type { Context } from "../context";

export const optionalAuth = os
  .$context<Context>()
  .middleware(async ({ context, next }) =>
    next({
      context: {
        session: context.session,
        user: context.user,
      },
    })
  );

export const requireAuth = os
  .$context<Context>()
  .middleware(({ context, next }) => {
    if (!(context.session && context.user)) {
      throw new ORPCError("UNAUTHORIZED");
    }
    return next({
      context: {
        session: context.session,
        user: context.user,
      },
    });
  });

// Rejects anonymous/guest users - for endpoints only registered users can access
export const requireAuthNoGuest = os
  .$context<Context>()
  .middleware(({ context, next }) => {
    if (!(context.session && context.user)) {
      throw new ORPCError("UNAUTHORIZED");
    }
    if (context.user.isAnonymous) {
      throw new ORPCError("FORBIDDEN", {
        message: "Guest users cannot perform this action",
      });
    }
    return next({
      context: {
        session: context.session,
        user: context.user,
      },
    });
  });
