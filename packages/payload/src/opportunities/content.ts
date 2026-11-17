import type { Opportunity } from "../payload-types";
import type { OpportunityContent } from "./model";

/**
 * Map a stored opportunity doc to the ranking engine's content shape. Shared
 * by the API feed and the digest task so both rank identical information.
 */
export function contentFromDoc(doc: Opportunity): OpportunityContent {
  const source = typeof doc.source === "object" ? doc.source : null;
  return {
    id: doc.id,
    title: doc.title,
    summary: doc.summary,
    category: doc.category,
    kind: doc.kind,
    canonicalUrl: doc.canonicalUrl,
    provider: doc.provider,
    location: doc.location ?? "",
    preferences: Array.isArray(doc.preferences)
      ? doc.preferences.filter((p): p is string => typeof p === "string")
      : [],
    details:
      doc.details &&
      typeof doc.details === "object" &&
      !Array.isArray(doc.details)
        ? Object.fromEntries(
            Object.entries(doc.details).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {},
    deadline: doc.deadline ?? null,
    publishedAt: doc.publishedAt,
    trust: source?.trust ?? "unverified",
    popularity: doc.popularity ?? 0,
    featured: doc.featured ?? false,
    quality: source?.qualityOverride ?? source?.qualityScore ?? 0,
    categories: Array.isArray(doc.categories)
      ? doc.categories.filter((x): x is string => typeof x === "string")
      : [],
  };
}
