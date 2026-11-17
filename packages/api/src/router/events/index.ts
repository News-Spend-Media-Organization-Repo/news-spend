import z from "zod";

import { publicProcedure } from "../../index";
import { createRateLimitMiddleware } from "../../lib/ratelimit";
import { cached } from "../../lib/shows/cache";
import {
  getEvent,
  getInventory,
  getSessions,
  ShowsApiError,
  showsRequest,
} from "../../lib/shows/client";
import type { ShowsConfig } from "../../lib/shows/config";
import type {
  ShowsEvent,
  ShowsEventQuery,
  ShowsInventory,
  ShowsList,
  ShowsSession,
} from "../../lib/shows/types";

/** v1 sells naira-only, and the list rarely changes enough to need fresher. */
const LIST_TTL_MS = 5 * 60 * 1000;
/** Availability moves, but 15 seconds still shields Shows from a retry loop. */
const INVENTORY_TTL_MS = 15 * 1000;
const CURRENCY = "NGN";
const EVENTS_PATH = "/products/ticketing/events";

const NOT_FOUND_MESSAGE = "Event not found";
const BAD_REQUEST_MESSAGE = "That event request is not valid";
const TOO_MANY_MESSAGE = "Too many requests";
/** Fixed copy: a Shows message may echo the URL or the buyer's input. */
const UNAVAILABLE_MESSAGE = "Ticketing is temporarily unavailable";

const eventsRateLimit = createRateLimitMiddleware({
  name: "events-read",
  by: "ip",
  maxRequests: 60,
  window: 60_000,
});

const eventsErrors = {
  SERVICE_UNAVAILABLE: {
    message: UNAVAILABLE_MESSAGE,
    status: 503,
  },
} as const;

const eventId = z.string().trim().min(1).max(200);

const listInput = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  place: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  startsAfter: z.string().datetime().optional(),
  startsBefore: z.string().datetime().optional(),
  free: z.boolean().optional(),
  onSale: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(200).optional(),
});

const getInput = z.object({ id: eventId });

const inventoryInput = z.object({
  eventId,
  sessionId: eventId.optional(),
});

type ErrorFactory = (options: { message: string }) => unknown;

type ShowsErrorFactories = {
  NOT_FOUND: ErrorFactory;
  BAD_REQUEST: ErrorFactory;
  TOO_MANY_REQUESTS: ErrorFactory;
  INTERNAL_SERVER_ERROR: ErrorFactory;
};

/** v1 is naira-only: an event priced otherwise is not browsable. */
function isNaira(currency: string | null | undefined): boolean {
  return currency == null || currency === CURRENCY;
}

function mapEvent(event: ShowsEvent) {
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    venue: event.venue ?? null,
    city: event.city ?? null,
    category: event.category ?? null,
    imageUrl: event.imageUrl ?? null,
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? null,
    currency: CURRENCY,
    fromPriceMinor: event.fromPriceMinor ?? null,
    free: event.free ?? false,
    onSale: event.onSale ?? false,
  };
}

/** Shows may attach a session revision; Task 1's type predates that field. */
type SessionWithRevision = ShowsSession & { revision?: string | null };

function mapSession(session: SessionWithRevision) {
  return {
    id: session.id,
    eventId: session.eventId,
    startsAt: session.startsAt,
    endsAt: session.endsAt ?? null,
    currency: session.currency,
    fromPriceMinor: session.fromPriceMinor ?? null,
    revision: session.revision ?? null,
  };
}

function mapInventory(inventory: ShowsInventory) {
  return {
    eventId: inventory.eventId,
    sessionId: inventory.sessionId ?? null,
    currency: CURRENCY,
    updatedAt: inventory.updatedAt ?? null,
    available: inventory.available ?? null,
    soldOut: inventory.soldOut ?? false,
    tiers: (inventory.tiers ?? []).map((tier) => ({
      id: tier.id,
      name: tier.name ?? null,
      priceMinor: tier.priceMinor,
      available: tier.available ?? null,
      soldOut: tier.soldOut ?? false,
    })),
  };
}

/** The typed client has no currency field, so ask for naira at the call site. */
function fetchEvents(
  config: ShowsConfig,
  query: ShowsEventQuery
): Promise<ShowsList<ShowsEvent>> {
  return showsRequest<ShowsList<ShowsEvent>>(config, EVENTS_PATH, {
    query: { ...query, display_currency: CURRENCY },
  });
}

function showsErrorFor(
  error: unknown
): { factory: keyof ShowsErrorFactories; message: string } | null {
  if (!(error instanceof ShowsApiError)) {
    return null;
  }

  if (error.status === 404) {
    return { factory: "NOT_FOUND", message: NOT_FOUND_MESSAGE };
  }
  if (error.status === 422 || error.code === "invalid_input") {
    return { factory: "BAD_REQUEST", message: BAD_REQUEST_MESSAGE };
  }
  if (error.status === 429) {
    return { factory: "TOO_MANY_REQUESTS", message: TOO_MANY_MESSAGE };
  }
  return { factory: "INTERNAL_SERVER_ERROR", message: UNAVAILABLE_MESSAGE };
}

function throwShowsError(error: unknown, errors: ShowsErrorFactories): never {
  const failure = showsErrorFor(error);

  if (!failure) {
    throw error;
  }

  throw errors[failure.factory]({ message: failure.message });
}

async function withShowsErrors<T>(
  load: () => Promise<T>,
  errors: ShowsErrorFactories
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    throwShowsError(error, errors);
  }
}

const list = publicProcedure
  .use(eventsRateLimit)
  .errors(eventsErrors)
  .input(listInput)
  .handler(async ({ input, context, errors }) => {
    const config = context.shows;
    if (!config) {
      throw errors.SERVICE_UNAVAILABLE({ message: UNAVAILABLE_MESSAGE });
    }

    const result = await withShowsErrors(
      () =>
        cached(
          `events:list:${JSON.stringify(input)}`,
          LIST_TTL_MS,
          Date.now,
          () => fetchEvents(config, input)
        ),
      errors
    );

    return {
      data: result.data
        .filter((event) => isNaira(event.currency))
        .map(mapEvent),
      nextCursor: result.nextCursor ?? null,
    };
  });

const get = publicProcedure
  .use(eventsRateLimit)
  .errors(eventsErrors)
  .input(getInput)
  .handler(async ({ input, context, errors }) => {
    const config = context.shows;
    if (!config) {
      throw errors.SERVICE_UNAVAILABLE({ message: UNAVAILABLE_MESSAGE });
    }

    const [event, sessions] = await withShowsErrors(
      () =>
        Promise.all([
          getEvent(config, input.id),
          getSessions(config, input.id),
        ]),
      errors
    );

    if (!isNaira(event.currency)) {
      throw errors.NOT_FOUND({ message: NOT_FOUND_MESSAGE });
    }

    return { ...mapEvent(event), sessions: sessions.data.map(mapSession) };
  });

const inventory = publicProcedure
  .use(eventsRateLimit)
  .errors(eventsErrors)
  .input(inventoryInput)
  .handler(async ({ input, context, errors }) => {
    const config = context.shows;
    if (!config) {
      throw errors.SERVICE_UNAVAILABLE({ message: UNAVAILABLE_MESSAGE });
    }

    const result = await withShowsErrors(
      () =>
        cached(
          `events:inventory:${JSON.stringify(input)}`,
          INVENTORY_TTL_MS,
          Date.now,
          () => getInventory(config, input.eventId, input.sessionId)
        ),
      errors
    );

    if (!isNaira(result.currency)) {
      throw errors.NOT_FOUND({ message: NOT_FOUND_MESSAGE });
    }

    return mapInventory(result);
  });

export const eventsRouter = {
  list,
  get,
  inventory,
};
