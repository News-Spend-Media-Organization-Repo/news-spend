import type { AnalyticsDb, AnalyticsScope } from "@news-spend-media/analytics";
import { scopeFor } from "@news-spend-media/analytics";
import type { PayloadRequest } from "payload";

/**
 * The zone "a day" is measured in, on every analytics screen. The newsroom and
 * its readers are in Nigeria; the admin panel already defaults to it. Change it
 * here and every chart follows.
 */
export const ANALYTICS_TIME_ZONE = "Africa/Lagos";

/** The admin panel's base path, for links between analytics screens. */
export const ADMIN_PATH = "/admin";

/** What the signed-in user may see, or `null` for nothing. */
export const scopeOfRequest = (
  req: Pick<PayloadRequest, "user">
): AnalyticsScope | null => scopeFor(req.user);

export const dbOf = (req: PayloadRequest): AnalyticsDb =>
  req.payload.db.drizzle;
