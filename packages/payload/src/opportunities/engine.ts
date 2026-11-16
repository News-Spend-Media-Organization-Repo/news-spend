import {
  DEFAULT_INTERESTS,
  type OpportunityContent,
  type OpportunityProfile,
  type RankedOpportunity,
  type Signal,
} from "./model";

const WEIGHTS = {
  open: 1,
  read: 2,
  save: 5,
  share: 4,
  more: 7,
  less: -8,
  dismiss: -15,
};

export function learnedInterests(signals: Signal[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const signal of signals) {
    scores[signal.category] = Math.max(
      -30,
      Math.min(30, (scores[signal.category] ?? 0) + WEIGHTS[signal.action])
    );
  }
  return scores;
}

export function canonicalize(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("An HTTPS source URL without credentials is required");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString().replace(/\/$/, "");
}

export function isClosed(
  item: Pick<OpportunityContent, "deadline">,
  now = Date.now()
): boolean {
  return item.deadline !== null && Date.parse(item.deadline) <= now;
}

/** Conservative cross-source identity: dates and location must also agree. */
export function duplicateIdentity(
  item: Pick<OpportunityContent, "title" | "category" | "location" | "deadline">
): string | null {
  if (!(item.deadline && item.location.trim())) {
    return null;
  }
  const words = item.title
    .toLowerCase()
    .replace(/\b(apply now|applications open|official|opportunity)\b/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 4) {
    return null;
  }
  const date = Date.parse(item.deadline);
  if (!Number.isFinite(date)) {
    return null;
  }
  return [
    item.category,
    [...new Set(words)].sort().join(" "),
    item.location.trim().toLowerCase(),
    new Date(date).toISOString().slice(0, 10),
  ].join("|");
}

/** Score internally; deliberately never return percentages or numerical match scores. */
export function rankOpportunities(
  content: OpportunityContent[],
  profile: OpportunityProfile,
  signals: Signal[],
  now = Date.now(),
  settings: { personalizedShare?: number; featuredBoost?: number } = {}
): RankedOpportunity[] {
  const enabled = profile.personalized && profile.consent;
  const effectiveSignals = enabled ? signals : [];
  const learned = learnedInterests(effectiveSignals);
  const dismissed = new Set(
    effectiveSignals
      .filter((s) => s.action === "dismiss")
      .map((s) => s.opportunityId)
  );
  const seen = new Set(
    effectiveSignals
      .filter((s) => s.action === "open" || s.action === "read")
      .map((s) => s.opportunityId)
  );
  const unique = new Map<string, OpportunityContent>();
  const canonicalKeys = new Map<string, string>();
  const duplicateKeys = new Map<string, string>();
  for (const item of content) {
    if (isClosed(item, now) || dismissed.has(item.id)) {
      continue;
    }
    let key: string;
    try {
      const canonical = canonicalize(item.canonicalUrl);
      const duplicate = duplicateIdentity(item);
      key =
        canonicalKeys.get(canonical) ??
        (duplicate ? duplicateKeys.get(duplicate) : undefined) ??
        canonical;
      canonicalKeys.set(canonical, key);
      if (duplicate) {
        duplicateKeys.set(duplicate, key);
      }
    } catch {
      continue;
    }
    const previous = unique.get(key);
    const trust = { official: 3, verified: 2, unverified: 1 };
    if (
      !previous ||
      trust[item.trust] > trust[previous.trust] ||
      (trust[item.trust] === trust[previous.trust] &&
        Object.keys(item.details).length > Object.keys(previous.details).length)
    ) {
      unique.set(key, item);
    }
  }
  const candidates = [...unique.values()]
    .map((item) => {
      const explicit = enabled && profile.interests.includes(item.category);
      const preference =
        enabled &&
        (profile.preferences[item.category] ?? []).some(
          (p) =>
            item.preferences.includes(p) ||
            item.location.toLowerCase().includes(p.toLowerCase())
        );
      const age = Math.max(
        0,
        (now - Date.parse(item.publishedAt)) / 86_400_000
      );
      const score =
        (explicit ? 60 : 0) +
        (preference ? 20 : 0) +
        (learned[item.category] ?? 0) +
        { official: 15, verified: 8, unverified: 0 }[item.trust] +
        Math.max(0, 14 - (Number.isFinite(age) ? age : 14)) +
        Math.min(8, Math.log1p(Math.max(0, item.popularity))) -
        (seen.has(item.id) ? 25 : 0) +
        (item.featured ? (settings.featuredBoost ?? 8) : 0) +
        Math.min(5, Math.max(0, item.quality ?? 0) / 20);
      const reason = enabled
        ? preference
          ? `Related to your interest in ${(profile.preferences[item.category] ?? []).find((p) => item.preferences.includes(p) || item.location.toLowerCase().includes(p.toLowerCase()))}`
          : explicit
            ? `Because you're interested in ${DEFAULT_INTERESTS.find((interest) => interest.key === item.category)?.label ?? item.category}`
            : (learned[item.category] ?? 0) > 0
              ? "Similar to content you've engaged with"
              : "Explore something new outside your usual interests"
        : "Latest and trending opportunities";
      return { ...item, score, reason, discovery: enabled && !explicit };
    })
    .sort((a, b) => b.score - a.score);

  // Interleave discovery, not rigid blocks of eight then two. Spread categories.
  const result: RankedOpportunity[] = [];
  const discoveryShare =
    1 - Math.min(100, Math.max(0, settings.personalizedShare ?? 80)) / 100;
  let discoveryCount = 0;
  while (candidates.length) {
    const wantDiscovery =
      enabled &&
      discoveryCount < Math.round((result.length + 1) * discoveryShare);
    const last = result.at(-1)?.category;
    let index = candidates.findIndex(
      (x) => x.discovery === wantDiscovery && x.category !== last
    );
    if (index < 0) {
      index = candidates.findIndex((x) => x.discovery === wantDiscovery);
    }
    if (index < 0) {
      index = candidates.findIndex((x) => x.category !== last);
    }
    const item = candidates.splice(Math.max(index, 0), 1)[0];
    if (!item) {
      break;
    }
    if (item.discovery) {
      discoveryCount++;
    }
    const { score: _score, ...publicItem } = item;
    result.push(publicItem);
  }
  return result;
}
