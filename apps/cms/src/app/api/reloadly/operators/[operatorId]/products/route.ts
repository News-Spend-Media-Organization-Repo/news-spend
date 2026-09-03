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
    return NextResponse.json(
      {
        error: err.message || "Failed to fetch operator products",
      },
      { status: err.status ?? 500 }
    );
  }
}
