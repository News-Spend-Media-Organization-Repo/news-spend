import type { TicketOrder } from "@news-spend-media/payload/types";
import z from "zod";
import type { Context } from "../../context";
import { protectedNoGuestProcedure, publicProcedure } from "../../index";
import { withKeyedLock } from "../../lib/keyedLock";
import { createRateLimitMiddleware } from "../../lib/ratelimit";
import { cached } from "../../lib/shows/cache";
import {
  createCheckout,
  getEvent,
  getInventory,
  getPurchase,
  getSessions,
  ShowsApiError,
  showsRequest,
} from "../../lib/shows/client";
import type { ShowsConfig } from "../../lib/shows/config";
import type {
  ShowsCheckout,
  ShowsCheckoutRequest,
  ShowsEvent,
  ShowsEventQuery,
  ShowsInventory,
  ShowsInventoryTier,
  ShowsList,
  ShowsSession,
} from "../../lib/shows/types";
import { pointsFor } from "../../lib/ticketOrders";

/** v1 sells naira-only, and the list rarely changes enough to need fresher. */
const LIST_TTL_MS = 5 * 60 * 1000;
/** Availability moves, but 15 seconds still shields Shows from a retry loop. */
const INVENTORY_TTL_MS = 15 * 1000;
/** A pending order is reusable for this long; matches the hosted-link assumption. */
const ORDER_HOLD_MS = 15 * 60 * 1000;
/** An order read asks Shows for its state no more often than this. */
const ORDER_REFRESH_MS = 30 * 1000;
const MAX_TICKETS_PER_TYPE = 4;
const MAX_TICKET_LINES = 10;
const CURRENCY = "NGN";
const EVENTS_PATH = "/products/ticketing/events";

const NOT_FOUND_MESSAGE = "Event not found";
const ORDER_NOT_FOUND_MESSAGE = "Order not found";
const BAD_REQUEST_MESSAGE = "That event request is not valid";
const TOO_MANY_MESSAGE = "Too many requests";
const INSUFFICIENT_STOCK_MESSAGE = "Those tickets are no longer available";
/** Fixed copy: a Shows message may echo the URL or the buyer's input. */
const UNAVAILABLE_MESSAGE = "Ticketing is temporarily unavailable";

const eventsRateLimit = createRateLimitMiddleware({
  name: "events-read",
  by: "ip",
  maxRequests: 60,
  window: 60_000,
});

/** Checkout taps are rare; the ceiling is per signed-in user. */
const checkoutRateLimit = createRateLimitMiddleware({
  name: "events-checkout",
  maxRequests: 20,
  window: 60_000,
});

/** The order screen polls about every five seconds, so 30 a minute is roomy. */
const orderRateLimit = createRateLimitMiddleware({
  name: "events-order",
  maxRequests: 30,
  window: 60_000,
});

const eventsErrors = {
  SERVICE_UNAVAILABLE: {
    message: UNAVAILABLE_MESSAGE,
    status: 503,
  },
} as const;

const checkoutErrors = {
  ...eventsErrors,
  INSUFFICIENT_STOCK: {
    message: INSUFFICIENT_STOCK_MESSAGE,
    status: 409,
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

const checkoutInput = z.object({
  eventId,
  sessionId: eventId,
  sessionRevision: z.string().trim().min(1).max(200),
  tickets: z
    .array(
      z.object({
        type: z.string().trim().min(1).max(200),
        quantity: z.number().int().min(1).max(MAX_TICKETS_PER_TYPE),
      })
    )
    .min(1)
    .max(MAX_TICKET_LINES)
    .refine(
      (lines) => new Set(lines.map((line) => line.type)).size === lines.length,
      { message: "A ticket type may appear only once" }
    ),
});

const orderInput = z.object({ reference: z.string().trim().min(1).max(200) });

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
  const free = event.free ?? false;

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
    free,
    onSale: event.onSale ?? false,
    pointsFrom: free ? 0 : pointsFor(event.fromPriceMinor ?? 0),
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

type OrderState = NonNullable<TicketOrder["state"]>;

const ORDER_STATES: readonly string[] = [
  "pending",
  "paid",
  "expired",
  "cancelled",
  "refunded",
  "failed",
];

type TicketLine = { type: string; quantity: number };
type StoredItem = TicketLine & { unitPriceMinor: number };
type Buyer = { name: string; email: string; phone?: string };

function isOrderState(value: unknown): value is OrderState {
  return typeof value === "string" && ORDER_STATES.includes(value);
}

function buyerFor(user: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): Buyer {
  return {
    name: user.name ?? "",
    email: user.email ?? "",
    ...(user.phone ? { phone: user.phone } : {}),
  };
}

/** `items` is a json column, so read it defensively rather than trusting it. */
function readItems(value: TicketOrder["items"]): StoredItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: StoredItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { type, quantity, unitPriceMinor } = entry as {
      type?: unknown;
      quantity?: unknown;
      unitPriceMinor?: unknown;
    };
    if (typeof type !== "string" || typeof quantity !== "number") {
      continue;
    }
    items.push({
      type,
      quantity,
      unitPriceMinor: typeof unitPriceMinor === "number" ? unitPriceMinor : 0,
    });
  }
  return items;
}

function selectionKey(items: TicketLine[]): string {
  return JSON.stringify(
    [...items]
      .sort((left, right) => left.type.localeCompare(right.type))
      .map(({ type, quantity }) => ({ type, quantity }))
  );
}

/** Built from the stored row so a replay sends byte-for-byte the same body. */
function checkoutRequest(order: {
  eventId: string | null | undefined;
  sessionId: string | null | undefined;
  items: TicketLine[];
  buyer: Buyer;
}): ShowsCheckoutRequest {
  return {
    eventId: order.eventId ?? "",
    sessionId: order.sessionId ?? "",
    items: order.items.map((item) => ({
      tierId: item.type,
      quantity: item.quantity,
    })),
    buyer: order.buyer,
  };
}

/**
 * Ask Shows for the row's checkout, retrying an unknown outcome once with the
 * same key and body.
 */
async function requestCheckout(
  config: ShowsConfig,
  order: TicketOrder
): Promise<ShowsCheckout> {
  const request = checkoutRequest({
    eventId: order.eventId,
    sessionId: order.sessionId,
    items: readItems(order.items),
    buyer: buyerFor(order.buyer ?? {}),
  });

  try {
    return await createCheckout(config, request, order.idempotencyKey);
  } catch (error) {
    if (!isUnknownOutcome(error)) {
      throw error;
    }
    // The same key and body make the second call the same checkout.
    return createCheckout(config, request, order.idempotencyKey);
  }
}

/** A checkout the buyer can still open, without asking Shows again. */
function storedCheckout(order: TicketOrder, now: number): ShowsCheckout | null {
  if (!(order.reference && order.checkoutUrl && order.checkoutExpiresAt)) {
    return null;
  }
  const expires = Date.parse(order.checkoutExpiresAt);
  if (!Number.isFinite(expires) || expires <= now) {
    return null;
  }
  return {
    reference: order.reference,
    checkoutUrl: order.checkoutUrl,
    expiresAt: order.checkoutExpiresAt,
  };
}

/** Whether a pending row is past the hold window or its checkout expiry. */
function isStale(order: TicketOrder, now: number): boolean {
  const created = Date.parse(order.createdAt);
  const expires = order.checkoutExpiresAt
    ? Date.parse(order.checkoutExpiresAt)
    : null;

  return (
    !Number.isFinite(created) ||
    now - created >= ORDER_HOLD_MS ||
    (expires !== null && Number.isFinite(expires) && expires <= now)
  );
}

/**
 * The stored checkout for this selection, if any, so a live URL is returned
 * even when Shows cannot be reached. The in-lock check stays authoritative.
 */
async function findStoredCheckout(
  payload: Context["payload"],
  userId: string,
  eventId: string,
  sessionId: string,
  selection: TicketLine[],
  now: number
): Promise<ShowsCheckout | null> {
  const found = await payload.find({
    collection: "ticket-orders",
    where: {
      and: [
        { user: { equals: userId } },
        { eventId: { equals: eventId } },
        { sessionId: { equals: sessionId } },
        { state: { equals: "pending" } },
        { checkoutUrl: { exists: true } },
      ],
    },
    sort: "-createdAt",
    limit: 20,
    depth: 0,
  });

  const key = selectionKey(selection);
  for (const order of found.docs) {
    if (isStale(order, now)) {
      continue;
    }
    if (selectionKey(readItems(order.items)) !== key) {
      continue;
    }
    const checkout = storedCheckout(order, now);
    if (checkout) {
      return checkout;
    }
  }

  return null;
}

/**
 * Expire pending rows for this user and session that can no longer be paid,
 * returning the ones still live.
 */
async function reapExpiredOrders(
  payload: Context["payload"],
  userId: string,
  sessionId: string,
  now: number
): Promise<TicketOrder[]> {
  const found = await payload.find({
    collection: "ticket-orders",
    where: {
      and: [
        { user: { equals: userId } },
        { sessionId: { equals: sessionId } },
        { state: { equals: "pending" } },
      ],
    },
    sort: "-createdAt",
    limit: 50,
    depth: 0,
  });

  const live: TicketOrder[] = [];
  for (const order of found.docs) {
    if (isStale(order, now)) {
      await payload.update({
        collection: "ticket-orders",
        id: order.id,
        data: { state: "expired" },
      });
    } else {
      live.push(order);
    }
  }

  return live;
}

function mapOrder(order: TicketOrder) {
  return {
    reference: order.reference ?? "",
    orderReference: order.orderReference ?? null,
    state: isOrderState(order.state) ? order.state : "pending",
    eventId: order.eventId ?? null,
    eventName: order.eventName ?? null,
    sessionId: order.sessionId ?? null,
    sessionAt: order.sessionAt ?? null,
    items: readItems(order.items).map(({ type, quantity, unitPriceMinor }) => ({
      type,
      quantity,
      unitPriceMinor,
    })),
    amountMinor: order.amountMinor ?? null,
    currency: order.currency ?? CURRENCY,
    refundedMinor: order.refundedMinor ?? 0,
    pointsAwarded: order.pointsAwarded ?? 0,
    createdAt: order.createdAt,
  };
}

/**
 * Price a selection against live inventory, or null when a line cannot be
 * fulfilled as asked.
 */
function priceSelection(
  inventory: ShowsInventory,
  selection: TicketLine[]
): { tiers: Map<string, ShowsInventoryTier>; amountMinor: number } | null {
  const tiers = new Map(
    (inventory.tiers ?? []).map((tier) => [tier.id, tier] as const)
  );
  let amountMinor = 0;

  for (const line of selection) {
    const tier = tiers.get(line.type);
    if (
      !tier ||
      tier.soldOut ||
      (tier.available != null && tier.available < line.quantity)
    ) {
      return null;
    }
    amountMinor += tier.priceMinor * line.quantity;
  }

  return { tiers, amountMinor };
}

function isUnknownOutcome(error: unknown): boolean {
  return (
    error instanceof ShowsApiError && error.code === "product_outcome_unknown"
  );
}

/** A 5xx, timeout, or unknown outcome may have created a checkout upstream. */
function isAmbiguousOutcome(error: unknown): boolean {
  return (
    isUnknownOutcome(error) ||
    (error instanceof ShowsApiError &&
      (error.status === 0 || error.status >= 500))
  );
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

const checkout = protectedNoGuestProcedure
  .use(checkoutRateLimit)
  .errors(checkoutErrors)
  .input(checkoutInput)
  .handler(async ({ input, context, errors }) => {
    const config = context.shows;
    if (!config) {
      throw errors.SERVICE_UNAVAILABLE({ message: UNAVAILABLE_MESSAGE });
    }

    const selection: TicketLine[] = input.tickets
      .map((ticket) => ({ type: ticket.type, quantity: ticket.quantity }))
      .sort((left, right) => left.type.localeCompare(right.type));

    const early = await findStoredCheckout(
      context.payload,
      context.user.id,
      input.eventId,
      input.sessionId,
      selection,
      Date.now()
    );
    if (early) {
      return early;
    }

    const [available, event, sessions] = await withShowsErrors(
      () =>
        Promise.all([
          getInventory(
            config,
            input.eventId,
            input.sessionId,
            input.sessionRevision
          ),
          getEvent(config, input.eventId),
          getSessions(config, input.eventId),
        ]),
      errors
    );

    const session = sessions.data.find(
      (candidate) => candidate.id === input.sessionId
    );
    if (!session) {
      throw errors.NOT_FOUND({ message: NOT_FOUND_MESSAGE });
    }

    if (!isNaira(available.currency)) {
      throw errors.NOT_FOUND({ message: NOT_FOUND_MESSAGE });
    }

    const priced = priceSelection(available, selection);
    if (!priced) {
      throw errors.INSUFFICIENT_STOCK({
        message: INSUFFICIENT_STOCK_MESSAGE,
      });
    }
    const { tiers, amountMinor } = priced;

    return withKeyedLock(
      `checkout:${context.user.id}:${input.sessionId}`,
      async () => {
        // shortcut: the keyed lock is per process, so two instances can still
        // both insert — upgrade to a partial unique index if that shows up in
        // production.
        const now = Date.now();
        const live = await reapExpiredOrders(
          context.payload,
          context.user.id,
          input.sessionId,
          now
        );
        const reusable = live.find(
          (order) =>
            selectionKey(readItems(order.items)) === selectionKey(selection)
        );

        const order =
          reusable ??
          (await context.payload.create({
            collection: "ticket-orders",
            data: {
              user: context.user.id,
              clientRef: crypto.randomUUID(),
              idempotencyKey: crypto.randomUUID(),
              state: "pending",
              eventId: input.eventId,
              eventName: event.title,
              sessionId: input.sessionId,
              sessionAt: session.startsAt,
              items: selection.map((line) => ({
                type: line.type,
                quantity: line.quantity,
                // ShowsCheckout carries no amount, so the row records the shelf
                // price until the purchase itself confirms what was charged.
                unitPriceMinor: tiers.get(line.type)?.priceMinor ?? 0,
              })),
              amountMinor,
              currency: CURRENCY,
              buyer: buyerFor(context.user),
            },
          }));

        // A live checkout is reused as-is; replaying it would mint another
        // hosted link.
        const stored = storedCheckout(order, now);
        if (stored) {
          return stored;
        }

        let shown: ShowsCheckout;
        try {
          shown = await requestCheckout(config, order);
        } catch (error) {
          // A 4xx means no checkout exists upstream; anything else may have
          // made one, so the row stays pending for a replay with the same key.
          if (!isAmbiguousOutcome(error)) {
            await context.payload.update({
              collection: "ticket-orders",
              id: order.id,
              data: { state: "failed" },
            });
          }
          if (
            error instanceof ShowsApiError &&
            error.code === "insufficient_stock"
          ) {
            throw errors.INSUFFICIENT_STOCK({
              message: INSUFFICIENT_STOCK_MESSAGE,
            });
          }
          throwShowsError(error, errors);
        }

        await context.payload.update({
          collection: "ticket-orders",
          id: order.id,
          data: {
            reference: shown.reference,
            amountMinor: order.amountMinor ?? amountMinor,
            currency: order.currency ?? CURRENCY,
            checkoutUrl: shown.checkoutUrl,
            checkoutExpiresAt: shown.expiresAt,
          },
        });

        return shown;
      }
    );
  });

const order = protectedNoGuestProcedure
  .use(orderRateLimit)
  .errors(eventsErrors)
  .input(orderInput)
  .handler(async ({ input, context, errors }) => {
    const config = context.shows;
    if (!config) {
      throw errors.SERVICE_UNAVAILABLE({ message: UNAVAILABLE_MESSAGE });
    }

    const found = await context.payload.find({
      collection: "ticket-orders",
      where: {
        and: [
          { reference: { equals: input.reference } },
          { user: { equals: context.user.id } },
        ],
      },
      limit: 1,
      depth: 0,
    });

    const row = found.docs[0];
    if (!row) {
      throw errors.NOT_FOUND({ message: ORDER_NOT_FOUND_MESSAGE });
    }

    const now = Date.now();
    const lastSynced = row.lastSyncedAt ? Date.parse(row.lastSyncedAt) : null;
    const fresh =
      lastSynced !== null &&
      Number.isFinite(lastSynced) &&
      now - lastSynced < ORDER_REFRESH_MS;

    if (row.state !== "pending" || fresh) {
      return mapOrder(row);
    }

    // The read must survive a Shows outage; the next poll retries.
    try {
      await getPurchase(config, input.reference);
      const updated = await context.payload.update({
        collection: "ticket-orders",
        id: row.id,
        data: { lastSyncedAt: new Date(now).toISOString() },
      });
      return mapOrder(updated ?? row);
    } catch {
      return mapOrder(row);
    }
  });

export const eventsRouter = {
  list,
  get,
  inventory,
  checkout,
  order,
};
