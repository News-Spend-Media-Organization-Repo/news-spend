/**
 * Shapes returned by the Shows.ng ticketing API.
 *
 * These are typed from the design spec, not from a sandbox credential: the
 * spec lists several fields as unverified (amount units, refund payload,
 * checkout echo). Optional where we cannot promise a value; the router maps
 * what it needs rather than re-exporting these shapes wholesale.
 */

export type ShowsList<T> = {
  data: T[];
  nextCursor?: string | null;
};

export type ShowsEvent = {
  id: string;
  title: string;
  description?: string | null;
  venue?: string | null;
  city?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  currency?: string | null;
  fromPriceMinor?: number | null;
  free?: boolean;
  onSale?: boolean;
};

export type ShowsEventQuery = {
  q?: string;
  place?: string;
  category?: string;
  startsAfter?: string;
  startsBefore?: string;
  free?: boolean;
  onSale?: boolean;
  limit?: number;
  cursor?: string;
  changedSince?: string;
};

export type ShowsSession = {
  id: string;
  eventId: string;
  startsAt: string;
  endsAt?: string | null;
  currency: string;
  fromPriceMinor?: number | null;
};

export type ShowsInventoryTier = {
  id: string;
  name?: string | null;
  priceMinor: number;
  available?: number | null;
  soldOut?: boolean;
};

export type ShowsInventory = {
  eventId: string;
  sessionId?: string | null;
  currency?: string | null;
  updatedAt?: string | null;
  tiers?: ShowsInventoryTier[];
  available?: number | null;
  soldOut?: boolean;
};

/** Sent to `POST /checkouts`. The caller must reuse this body with its key. */
export type ShowsCheckoutRequest = {
  eventId: string;
  sessionId: string;
  items: Array<{ tierId: string; quantity: number }>;
  buyer?: { name: string; email: string; phone?: string };
  metadata?: Record<string, string>;
  returnUrl?: string;
};

export type ShowsCheckout = {
  reference: string;
  checkoutUrl: string;
  expiresAt: string;
};

/**
 * A purchase. `amountMinor` is kobo for NGN; the spec has not confirmed the
 * unit against a sandbox response.
 */
export type ShowsPurchase = {
  reference: string;
  orderReference?: string | null;
  state?: string | null;
  status?: string | null;
  eventId?: string | null;
  sessionId?: string | null;
  amountMinor: number;
  currency: string;
  refundedMinor?: number | null;
  items?: Array<{ type?: string; quantity: number; unitPriceMinor: number }>;
  createdAt?: string | null;
};
