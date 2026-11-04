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
 * Search or fetch Reloadly gift card products for the Prize Catalogue admin.
 * Accepts either `productName` (search, up to 20 results) or `productId`
 * (exactly one product), and returns the environment alongside the products so
 * the editor can see at a glance whether a card is sandbox or live.
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

    if (!productName) {
      return NextResponse.json({ environment, products: [] });
    }

    const products = await client.listProducts({ productName, size: 20 });
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
