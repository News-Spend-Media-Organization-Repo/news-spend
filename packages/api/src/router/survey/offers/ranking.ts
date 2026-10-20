import type {
  ProviderSetting,
  ResolvedSurveySettings,
  SurveyProviderId,
} from "@news-spend-media/payload/lib/surveySettings";

import type { UnifiedOffer } from "./schemas";

const priorityOf = (
  settings: ResolvedSurveySettings,
  provider: UnifiedOffer["provider"]
): number => settings.providers[provider as SurveyProviderId]?.priority ?? 0;

/**
 * Provider priority first, then the better-paying survey, then id so equal
 * offers keep a stable order between requests.
 */
export function rankOffers(
  offers: UnifiedOffer[],
  settings: ResolvedSurveySettings,
  limit: number
): UnifiedOffer[] {
  return [...offers]
    .sort((a, b) => {
      const priority =
        priorityOf(settings, a.provider) - priorityOf(settings, b.provider);
      if (priority !== 0) {
        return priority;
      }
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

const enabledWalls = (settings: ResolvedSurveySettings): ProviderSetting[] =>
  Object.values(settings.providers)
    .filter((setting) => setting.enabled && setting.wallUrl)
    .sort((a, b) => a.priority - b.priority);

/** The card shown when no provider has an offer: open a provider's wall. */
export function fallbackOffer(
  settings: ResolvedSurveySettings,
  userId: string
): UnifiedOffer | null {
  const first = enabledWalls(settings)[0];
  const wallUrl = first?.wallUrl;
  if (!(first && wallUrl)) {
    return null;
  }

  return {
    id: `wall-${first.provider}`,
    provider: first.provider,
    title: "More surveys",
    description: "Open the survey wall for more surveys",
    points: 0,
    type: "survey",
    url: wallUrl.replace("{userId}", userId),
  };
}

/** A card without a URL cannot be opened, and must not suppress the wall. */
export const hasUsableUrl = (offer: UnifiedOffer): boolean =>
  typeof offer.url === "string" && offer.url.trim().length > 0;

/**
 * Runs one provider's fetch. A provider that hangs or throws contributes an
 * empty list and a log line; it never takes the tab down with it.
 */
export async function runProvider(
  provider: string,
  pending: Promise<UnifiedOffer[]>,
  ms: number
): Promise<UnifiedOffer[]> {
  try {
    const offers = await withTimeout(pending, ms);
    if (offers === null) {
      console.warn(`Survey provider ${provider} timed out`);
      return [];
    }
    return offers;
  } catch (error) {
    console.error(`Survey provider ${provider} failed:`, error);
    return [];
  }
}

/** A provider that does not answer must not hold the whole tab. */
export function withTimeout<T>(
  pending: Promise<T>,
  ms: number
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });

  return Promise.race([pending, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}
