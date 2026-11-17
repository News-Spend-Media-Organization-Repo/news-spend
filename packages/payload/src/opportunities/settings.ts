import type { Payload } from "payload";

export const DEFAULT_OPPORTUNITY_SETTINGS = {
  personalizedShare: 80,
  featuredBoost: 8,
  candidateLimit: 1000,
  dailyDigestEnabled: true,
  digestIntervalHours: 24,
  sourceDiscoveryEnabled: true,
  minimumSourceQuality: 60,
  liveEnabled: false,
  liveTitle: "NewsSpend Live",
  liveDescription: "",
  liveStreamUrl: "",
};

export async function opportunitySettings(payload: Payload) {
  const value = await payload.findGlobal({ slug: "opportunity-settings" });
  return {
    personalizedShare:
      value?.personalizedShare ??
      DEFAULT_OPPORTUNITY_SETTINGS.personalizedShare,
    featuredBoost:
      value?.featuredBoost ?? DEFAULT_OPPORTUNITY_SETTINGS.featuredBoost,
    candidateLimit:
      value?.candidateLimit ?? DEFAULT_OPPORTUNITY_SETTINGS.candidateLimit,
    dailyDigestEnabled:
      value?.dailyDigestEnabled ??
      DEFAULT_OPPORTUNITY_SETTINGS.dailyDigestEnabled,
    digestIntervalHours:
      value?.digestIntervalHours ??
      DEFAULT_OPPORTUNITY_SETTINGS.digestIntervalHours,
    sourceDiscoveryEnabled:
      value?.sourceDiscoveryEnabled ??
      DEFAULT_OPPORTUNITY_SETTINGS.sourceDiscoveryEnabled,
    minimumSourceQuality:
      value?.minimumSourceQuality ??
      DEFAULT_OPPORTUNITY_SETTINGS.minimumSourceQuality,
    liveEnabled: value?.liveEnabled ?? false,
    liveTitle: value?.liveTitle ?? DEFAULT_OPPORTUNITY_SETTINGS.liveTitle,
    liveDescription: value?.liveDescription ?? "",
    liveStreamUrl: value?.liveStreamUrl ?? "",
  };
}
