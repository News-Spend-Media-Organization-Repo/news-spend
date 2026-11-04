import {
  type ReloadlyConfig,
  reloadlyConfigFromEnv,
} from "@news-spend-media/payload/lib/giveaway/reloadly";
import { ReloadlyGiftCardClient } from "@news-spend-media/payload/lib/giveaway/reloadlyGiftCards";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "../../../_lib/requireAdmin";

/**
 * GET /api/reloadly/gift-cards/products
 *
 * Fetch Reloadly gift card products for the Prize Catalogue admin. With no
 * parameters it returns the whole Nigerian catalogue, which is small enough
 * (25 products live) to render as one searchable dropdown. `productId` fetches
 * exactly one product, and `productName` remains a server-side search. The
 * environment is returned alongside so the editor can see at a glance whether
 * a card is sandbox or live.
 *
 * Admin-only, for the same reason as the operator products route: this is an
 * authenticated proxy onto the Reloadly gift card account.
 */

/**
 * One client for the process, so its cached bearer token is actually reused.
 * Rebuilt only if the credentials change under us.
 */
let cachedClient: {
  client: ReloadlyGiftCardClient;
  key: string;
} | null = null;

function getClient(config: ReloadlyConfig) {
  const key = `${config.clientId}:${config.env}`;
  if (cachedClient?.key !== key) {
    cachedClient = { client: new ReloadlyGiftCardClient(config), key };
  }
  return cachedClient.client;
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req.headers);
  if (denied) {
    return denied;
  }

  const config = reloadlyConfigFromEnv();
  if (!config) {
    return NextResponse.json(
      { error: "Reloadly is not configured" },
      { status: 503 }
    );
  }

  const { productId, productName } = Object.fromEntries(
    req.nextUrl.searchParams
  );

  try {
    const client = getClient(config);
    const environment = config.env;

    if (productId) {
      const id = Number(productId);
      if (Number.isNaN(id)) {
        return NextResponse.json(
          { error: "Invalid product ID" },
          { status: 400 }
        );
      }
      const product = await client.getProduct(id);
      return NextResponse.json({ environment, products: [product] });
    }

    const products = await client.listProducts(
      productName ? { productName, size: 20 } : { size: 200 }
    );
    return NextResponse.json({ environment, products });
  } catch (err) {
    // Pass Reloadly's own error code through, exactly like the operator route.
    const reloadlyErr = err as {
      message?: string;
      status?: number;
      body?: { errorCode?: string; message?: string } | null;
    };
    const body = reloadlyErr.body;

    return NextResponse.json(
      {
        error: reloadlyErr.message || "Failed to fetch gift card products",
        ...(body?.errorCode ? { errorCode: body.errorCode } : {}),
        ...(body?.message ? { providerMessage: body.message } : {}),
      },
      { status: reloadlyErr.status ?? 500 }
    );
  }
}
