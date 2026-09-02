import type { PayloadRequest } from "payload";

import { ReloadlyClient, reloadlyConfigFromEnv } from "../lib/giveaway/reloadly";

/**
 * GET /api/reloadly/operators/:operatorId/products
 *
 * Fetch available products/denominations for a Reloadly operator.
 * Used by the Prize Catalogue admin UI to show available amounts.
 */
export const reloadlyEndpoint = async (req: PayloadRequest) => {
  const { operatorId } = req.params;

  if (!operatorId || isNaN(Number(operatorId))) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid operator ID" }),
    };
  }

  const config = reloadlyConfigFromEnv();
  if (!config) {
    return {
      statusCode: 503,
      body: JSON.stringify({
        error: "Reloadly is not configured",
      }),
    };
  }

  try {
    const client = new ReloadlyClient(config);
    const products = await client.getOperatorProducts(Number(operatorId));

    return {
      statusCode: 200,
      body: JSON.stringify(products),
    };
  } catch (err: any) {
    return {
      statusCode: err.status ?? 500,
      body: JSON.stringify({
        error: err.message,
      }),
    };
  }
};
