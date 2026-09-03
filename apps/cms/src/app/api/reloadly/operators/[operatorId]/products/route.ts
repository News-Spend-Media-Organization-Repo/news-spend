import {
  ReloadlyClient,
  reloadlyConfigFromEnv,
} from "@news-spend-media/payload/lib/giveaway/reloadly";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * GET /api/reloadly/operators/:operatorId/products
 *
 * Fetch available products/denominations for a Reloadly operator.
 * Used by the Prize Catalogue admin UI to dynamically show available amounts.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ operatorId: string }> }
) {
  const { operatorId } = await params;

  if (!operatorId || Number.isNaN(Number(operatorId))) {
    return NextResponse.json({ error: "Invalid operator ID" }, { status: 400 });
  }

  const config = reloadlyConfigFromEnv();
  if (!config) {
    return NextResponse.json(
      {
        error: "Reloadly is not configured",
      },
      { status: 503 }
    );
  }

  try {
    const client = new ReloadlyClient(config);
    const products = await client.getOperatorProducts(Number(operatorId));

    return NextResponse.json(products);
  } catch (err: any) {
    /**
     * Pass Reloadly's own error code through.
     *
     * `ReloadlyError` already carries the provider's response body, but only
     * `message` was returned, so every auth failure read as the same generic
     * "Could not authenticate with Reloadly". That cannot distinguish a wrong
     * secret from the right secret used against the wrong environment — the
     * production account had sandbox credentials with `RELOADLY_ENV=live`, and
     * the `INVALID_CREDENTIALS` that would have named it was discarded here.
     */
    const body = err?.body as { errorCode?: string; message?: string } | null;

    return NextResponse.json(
      {
        error: err.message || "Failed to fetch operator products",
        ...(body?.errorCode ? { errorCode: body.errorCode } : {}),
        ...(body?.message ? { providerMessage: body.message } : {}),
      },
      { status: err.status ?? 500 }
    );
  }
}
