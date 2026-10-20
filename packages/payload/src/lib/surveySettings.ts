/**
 * Survey mediation settings with every default already applied.
 *
 * The global is policy, not a prerequisite: an unsaved or half-saved document
 * must leave today's providers working and the unverified ones off. Pure so
 * the precedence rules are testable without a database.
 */

export const SURVEY_PROVIDER_IDS = [
  "cpx",
  "rapido",
  "theorem",
  "bitlabs",
] as const;

export type SurveyProviderId = (typeof SURVEY_PROVIDER_IDS)[number];

export type ProviderSetting = {
  provider: SurveyProviderId;
  enabled: boolean;
  priority: number;
  countries: string[];
  wallUrl: string | null;
};

export type ResolvedSurveySettings = {
  providers: Record<SurveyProviderId, ProviderSetting>;
  dailyPointsCap: number;
  maxPointsPerAward: number;
};

export type SurveySettingsDoc = {
  providers?: Array<{
    provider?: string | null;
    enabled?: boolean | null;
    priority?: number | null;
    countries?: string[] | null;
    wallUrl?: string | null;
  }> | null;
  dailyPointsCap?: number | null;
  maxPointsPerAward?: number | null;
};

export const DEFAULT_DAILY_POINTS_CAP = 20_000;
export const DEFAULT_MAX_POINTS_PER_AWARD = 5000;
export const MAX_POINTS_PER_AWARD_LIMIT = 50_000;

const defaultsFor = (provider: SurveyProviderId): ProviderSetting => ({
  provider,
  // Theorem is built but unverified; BitLabs has no adapter yet.
  enabled: provider === "cpx" || provider === "rapido",
  priority: 0,
  countries: [],
  wallUrl: null,
});

export const PROVIDER_DEFAULTS: Record<SurveyProviderId, ProviderSetting> =
  Object.fromEntries(
    SURVEY_PROVIDER_IDS.map((provider) => [provider, defaultsFor(provider)])
  ) as Record<SurveyProviderId, ProviderSetting>;

const isProviderId = (value: unknown): value is SurveyProviderId =>
  typeof value === "string" &&
  (SURVEY_PROVIDER_IDS as readonly string[]).includes(value);

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const countriesOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((code): code is string => typeof code === "string")
        .map((code) => code.trim().toUpperCase())
        .filter((code) => code.length > 0)
    : [];

export function resolveSurveySettings(
  doc: SurveySettingsDoc | null | undefined
): ResolvedSurveySettings {
  const providers = Object.fromEntries(
    SURVEY_PROVIDER_IDS.map((provider) => [
      provider,
      { ...defaultsFor(provider) },
    ])
  ) as Record<SurveyProviderId, ProviderSetting>;

  for (const row of doc?.providers ?? []) {
    if (!isProviderId(row.provider)) {
      continue;
    }

    const setting = providers[row.provider];
    if (typeof row.enabled === "boolean") {
      setting.enabled = row.enabled;
    }
    setting.priority = numberOr(row.priority, setting.priority);
    if (Array.isArray(row.countries)) {
      setting.countries = countriesOf(row.countries);
    }
    if (typeof row.wallUrl === "string") {
      setting.wallUrl = row.wallUrl.trim() || null;
    }
  }

  const dailyPointsCap = doc?.dailyPointsCap;
  const maxPointsPerAward = numberOr(
    doc?.maxPointsPerAward,
    DEFAULT_MAX_POINTS_PER_AWARD
  );

  return {
    providers,
    // Zero is a real setting (no survey payouts), not a missing value.
    dailyPointsCap:
      typeof dailyPointsCap === "number" &&
      Number.isFinite(dailyPointsCap) &&
      dailyPointsCap >= 0
        ? dailyPointsCap
        : DEFAULT_DAILY_POINTS_CAP,
    maxPointsPerAward:
      maxPointsPerAward >= 1
        ? Math.min(maxPointsPerAward, MAX_POINTS_PER_AWARD_LIMIT)
        : DEFAULT_MAX_POINTS_PER_AWARD,
  };
}
