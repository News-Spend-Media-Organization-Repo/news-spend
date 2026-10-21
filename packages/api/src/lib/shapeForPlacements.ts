import { isEarnRequest } from "@news-spend-media/payload/lib/earnPlacements";

type Shapeable = {
  adCopy?: string | null;
  condition?: string | null;
  description?: string | null;
  points?: number | null;
};

/**
 * Shapes a partner-content doc for the surface that asked for it.
 *
 * Earn surfaces (every requested placement is an earn placement) get the doc
 * as stored. Everything else is an ad surface: the task-oriented `condition`
 * and `points` must not reach it, so `condition` becomes the ad copy and
 * `points` is removed. The stored `condition` is never the fallback.
 */
export function shapeForPlacements<T extends Shapeable>(
  doc: T,
  requested: readonly string[] | undefined
): T {
  if (isEarnRequest(requested)) {
    return doc;
  }
  const { points: _points, ...rest } = doc;
  return {
    ...rest,
    condition: doc.adCopy || doc.description || "",
  } as unknown as T;
}
