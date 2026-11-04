/**
 * Reloadly gift cards client (#197).
 *
 * A second client rather than a method on `ReloadlyClient`: Reloadly scopes a
 * token to one product, so gift cards need their own audience and their own
 * cached token even though the credentials are shared.
 */

import type { ReloadlyConfig } from "./reloadly";
import { ReloadlyError, reloadlyConfigFromEnv } from "./reloadly";

const AUTH_URL = "https://auth.reloadly.com/oauth/token";

const HOSTS = {
  sandbox: "https://giftcards-sandbox.reloadly.com",
  live: "https://giftcards.reloadly.com",
} as const;

/** Reloadly versions its API through Accept, not the URL. */
const ACCEPT = "application/com.reloadly.giftcards-v1+json";
/** The redeem-code endpoint only exposes `redemptionUrl` on v2. */
const ACCEPT_V2 = "application/com.reloadly.giftcards-v2+json";

/** Refresh a little before expiry so a call never races the clock. */
const TOKEN_SKEW_MS = 60_000;

export type GiftCardProduct = {
  productId: number;
  productName: string;
  denominationType: "FIXED" | "RANGE";
  recipientCurrencyCode: string;
  senderCurrencyCode: string;
  fixedRecipientDenominations: number[] | null;
  fixedSenderDenominations: number[] | null;
  minRecipientDenomination: number | null;
  maxRecipientDenomination: number | null;
  minSenderDenomination: number | null;
  maxSenderDenomination: number | null;
  redeemInstructions: {
    concise?: string | null;
    verbose?: string | null;
  } | null;
};

export type GiftCardOrder = {
  transactionId: number;
  status: string;
  currencyCode: string;
  /** The account-currency charge (face value plus fees), per Reloadly's order/report schema. */
  amount?: number | null;
  product: {
    productId: number;
    productName: string;
    unitPrice: number;
    totalPrice: number;
    currencyCode: string;
  };
};

export type GiftCardCode = {
  cardNumber: string;
  pinCode?: string | null;
  redemptionUrl?: string | null;
};

export type GiftCardTransaction = GiftCardOrder;

/** Reloadly mixes bare arrays (reports) with `{ content }` envelopes (products). */
type Paged<T> = T[] | { content?: T[] };

function items<T>(body: Paged<T>): T[] {
  return Array.isArray(body) ? body : (body.content ?? []);
}

/** The API spells the field singular; the client exposes one name. */
type ApiProduct = Omit<GiftCardProduct, "redeemInstructions"> & {
  redeemInstructions?: GiftCardProduct["redeemInstructions"];
  redeemInstruction?: GiftCardProduct["redeemInstructions"];
};

function normaliseProduct(raw: ApiProduct): GiftCardProduct {
  const { redeemInstruction, ...product } = raw;
  return {
    ...product,
    redeemInstructions: product.redeemInstructions ?? redeemInstruction ?? null,
  };
}

type ReportTransaction = GiftCardTransaction & { customIdentifier?: string };

export class ReloadlyGiftCardClient {
  private readonly config: ReloadlyConfig;
  private readonly fetchImpl: typeof fetch;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: ReloadlyConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  get isSandbox() {
    return this.config.env === "sandbox";
  }

  /**
   * A bearer token for the gift card product, cached until shortly before it
   * expires. Minting one per order would triple the request count of a batch
   * and rate-limit the run for no benefit.
   */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }

    const response = await this.fetchImpl(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "client_credentials",
        audience: HOSTS[this.config.env],
      }),
    });

    const body = (await response.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
    } | null;

    if (!(response.ok && body?.access_token)) {
      throw new ReloadlyError(
        "Could not authenticate with Reloadly",
        response.status,
        body,
        response.status >= 500
      );
    }

    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 - TOKEN_SKEW_MS,
    };

    return this.token.value;
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown; accept?: string } = {}
  ): Promise<T> {
    const token = await this.accessToken();

    const response = await this.fetchImpl(`${HOSTS[this.config.env]}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: init.accept ?? ACCEPT,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (body as { message?: string } | null)?.message ??
        `Reloadly request failed (${response.status})`;

      throw new ReloadlyError(
        message,
        response.status,
        body,
        response.status >= 500 || response.status === 429
      );
    }

    return body as T;
  }

  async listProducts(
    args: { productName?: string; page?: number; size?: number } = {}
  ): Promise<GiftCardProduct[]> {
    const params = new URLSearchParams({
      countryCode: "NG",
      size: String(args.size ?? 200),
      page: String(args.page ?? 1),
    });

    if (args.productName) {
      params.set("productName", args.productName);
    }

    const body = await this.request<Paged<ApiProduct>>(
      `/products?${params.toString()}`
    );

    return items(body).map(normaliseProduct);
  }

  async getProduct(productId: number): Promise<GiftCardProduct> {
    const body = await this.request<ApiProduct>(`/products/${productId}`);
    return normaliseProduct(body);
  }

  /**
   * Buy one card at the recipient-currency face value.
   *
   * `customIdentifier` is the prize's own identifier, so a retry after a
   * failed code fetch is refused as a duplicate rather than buying a second
   * card. `ReloadlyError.isAlreadySent` names that case.
   */
  order(args: {
    productId: number;
    unitPrice: number;
    customIdentifier: string;
  }): Promise<GiftCardOrder> {
    return this.request<GiftCardOrder>("/orders", {
      method: "POST",
      body: {
        productId: args.productId,
        quantity: 1,
        unitPrice: args.unitPrice,
        customIdentifier: args.customIdentifier,
        senderName: "News Spend",
      },
    });
  }

  getCode(transactionId: string | number): Promise<GiftCardCode> {
    return this.request<GiftCardCode>(
      `/orders/transactions/${transactionId}/cards`,
      { accept: ACCEPT_V2 }
    );
  }

  /**
   * The transaction for a `customIdentifier`, or null when Reloadly has none.
   *
   * A 404 here means the identifier is unknown, which is a normal answer on
   * the first attempt rather than an error worth surfacing.
   */
  async findTransaction(
    customIdentifier: string
  ): Promise<GiftCardTransaction | null> {
    try {
      const body = await this.request<Paged<ReportTransaction>>(
        `/reports/transactions?customIdentifier=${encodeURIComponent(
          customIdentifier
        )}&size=1`
      );

      // Filter here too: an ignored query parameter must not hand back
      // somebody else's transaction.
      return (
        items(body).find((tx) => tx.customIdentifier === customIdentifier) ??
        null
      );
    } catch (error) {
      if (error instanceof ReloadlyError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  getTransaction(transactionId: string | number): Promise<GiftCardTransaction> {
    return this.request<GiftCardTransaction>(
      `/reports/transactions/${transactionId}`
    );
  }
}

export function reloadlyGiftCardClientFromEnv(): ReloadlyGiftCardClient | null {
  const config = reloadlyConfigFromEnv();
  return config ? new ReloadlyGiftCardClient(config) : null;
}
