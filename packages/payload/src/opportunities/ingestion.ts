import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { isIP } from "node:net";
import type { Payload } from "payload";
import { canonicalize, duplicateIdentity } from "./engine";
import { parseSource } from "./formats";
import { DEFAULT_INTERESTS } from "./model";
import { opportunitySettings } from "./settings";

/** Deny private, loopback, link-local, multicast and reserved addresses. */
export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) {
    return false;
  }
  const [a = 0, b = 0] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0)
  );
}

/** Resolve once, validate, then pin the connection. Never follow redirects. */
export async function fetchPublicFeed(value: string): Promise<unknown> {
  const url = new URL(canonicalize(value));
  if (url.port && url.port !== "443") {
    throw new Error("Only standard HTTPS ports are allowed");
  }
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((a) => !isPublicIPv4(a.address))) {
    throw new Error("The source must resolve to a public address");
  }
  const pinned = addresses[0];
  if (!pinned) {
    throw new Error("Source DNS lookup failed");
  }
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: {
          Accept:
            "application/feed+json, application/json, application/rss+xml, application/atom+xml, text/html",
          "User-Agent": "NewsSpend/ForYou",
        },
        lookup: (_host, _options, callback) =>
          callback(null, pinned.address, 4),
        timeout: 15_000,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `Source returned HTTP ${response.statusCode ?? "unknown"}`
            )
          );
          return;
        }
        const buffers: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2_000_000) {
            response.destroy(new Error("Source exceeded the 2 MB limit"));
            return;
          }
          buffers.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve(
              parseSource(Buffer.concat(buffers).toString("utf8"), url.href)
            );
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error("Source could not be parsed")
            );
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("Source timed out")));
    request.on("error", reject);
  });
}

const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const text = (v: unknown, max = 5000): string =>
  typeof v === "string"
    ? v
        .replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, max)
    : "";
const isoDate = (v: unknown): string | null =>
  typeof v === "string" && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null;

export function classifyCategories(
  title: string,
  summary: string,
  fallback: string
): string[] {
  const haystack = `${title} ${summary}`.toLowerCase();
  const terms: [RegExp, string][] = [
    [/scholarship|postgraduate|undergraduate|tuition/, "education"],
    [/immigration|visa|express entry|residency/, "immigration"],
    [/internship|fellowship|apprentice/, "internships"],
    [/volunteer|community program|social impact/, "community"],
    [/hackathon|competition|conference|award/, "events"],
    [/grant|funding/, "funding"],
    [/vacancy|hiring|job opening|recruitment/, "jobs"],
    [/career advice|certification|mentorship|leadership development/, "career"],
    [/comedy|comedian|stand.?up/, "comedy"],
    [/communication|public speaking|journalism|broadcast/, "communication"],
    [/artificial intelligence|\bai\b|machine learning/, "ai"],
    [/startup|entrepreneur|accelerator|tender/, "business"],
    [
      /artificial intelligence|software|cybersecurity|digital|technology/,
      "technology",
    ],
  ];
  const matches = terms
    .filter(([pattern]) => pattern.test(haystack))
    .map(([, key]) => key);
  return [...new Set(matches.length ? matches : [fallback])];
}

export function classifyContent(
  title: string,
  summary: string,
  fallback: string
): string {
  return classifyCategories(title, summary, fallback)[0] ?? fallback;
}

/** Only extract a stated absolute date containing its year; never invent deadlines. */
export function extractDeadline(value: string): string | null {
  const match =
    /(?:deadline|closing date|apply by|closes|valid through)\s*[:-]?\s*(\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/i.exec(
      value
    );
  return isoDate(match?.[1]);
}

export function extractOpportunityDetails(
  value: string
): Record<string, string> {
  const details: Record<string, string> = {};
  for (const label of [
    "Eligibility",
    "Requirements",
    "Location",
    "Country",
    "Funding",
    "Study Level",
    "Work Arrangement",
    "Employment Type",
  ]) {
    const match = new RegExp(`\\b${label}\\s*:\\s*([^;\\n.]{2,300})`, "i").exec(
      value
    );
    if (match?.[1]) {
      details[label] = match[1].trim();
    }
  }
  return details;
}

export function extractPreferences(category: string, value: string): string[] {
  const hints: Record<string, [RegExp, string][]> = {
    jobs: [
      [/software|developer|digital|\bit\b|data analyst/i, "IT & Digital"],
      [/business analyst|governance|management/i, "Business & Governance"],
      [
        /customer|technical support|help.?desk/i,
        "Customer & Technical Support",
      ],
      [/health|nurs|medical|doctor/i, "Healthcare"],
      [/engineer|technical/i, "Engineering & Technical"],
      [/finance|accountant|banking/i, "Finance"],
      [/teacher|education|lecturer/i, "Education"],
    ],
    technology: [
      [/\bai\b|artificial intelligence|data/i, "AI & Data"],
      [/software|cloud|developer/i, "Software & Cloud"],
      [/cyber|security/i, "Cybersecurity"],
      [/innovation|digital/i, "Digital Innovation"],
    ],
    education: [
      [/undergraduate/i, "Undergraduate"],
      [
        /postgraduate|\bgraduate\b|masters|doctoral|phd/i,
        "Graduate/Postgraduate",
      ],
      [/professional|skills|training/i, "Professional & Skills Training"],
      [/research/i, "Research"],
    ],
    immigration: [
      ["Canada", "Canada"],
      ["United States", "United States"],
      ["United Kingdom", "United Kingdom"],
      ["Australia", "Australia"],
      ["Europe", "Europe"],
    ].map(([pattern, label]) => [new RegExp(pattern ?? "", "i"), label ?? ""]),
  };
  return [
    ...new Set([
      ...(
        DEFAULT_INTERESTS.find((item) => item.key === category)?.preferences ??
        []
      ).filter((label) => value.toLowerCase().includes(label.toLowerCase())),
      ...(hints[category] ?? [])
        .filter(([pattern]) => pattern.test(value))
        .map(([, label]) => label),
    ]),
  ];
}

export async function ingestSource(
  payload: Payload,
  sourceId: string
): Promise<number> {
  const source = await payload.findByID({
    collection: "opportunity-sources",
    id: sourceId,
  });
  if (source.status !== "approved") {
    return 0;
  }
  const feed = record(await fetchPublicFeed(source.feedUrl));
  if (!Array.isArray(feed.items)) {
    throw new Error("Source did not produce any supported feed items");
  }
  const catalog = await payload.find({
    collection: "opportunity-interests",
    where: { active: { equals: true } },
    limit: 100,
  });
  const categories = new Set(
    catalog.docs.length
      ? catalog.docs.map((d) => d.key)
      : DEFAULT_INTERESTS.map((d) => d.key)
  );
  let imported = 0;
  for (const raw of feed.items.slice(0, 100)) {
    const item = record(raw);
    const metadata = record(item._newsspend);
    const title = text(item.title, 250);
    const summary = text(
      item.summary || item.content_text || item.content_html
    );
    if (!(title && summary) || typeof item.url !== "string") {
      continue;
    }
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalize(item.url);
    } catch {
      continue;
    }
    // An approved source cannot launder an arbitrary third-party destination.
    if (new URL(canonicalUrl).hostname !== new URL(source.feedUrl).hostname) {
      continue;
    }
    const classifications = classifyCategories(
      title,
      summary,
      source.category
    ).filter((key) => categories.has(key));
    const category =
      classifications[0] ??
      (categories.has(source.category) ? source.category : null);
    if (!category) {
      continue;
    }
    const deadline = isoDate(metadata.deadline) ?? extractDeadline(summary);
    const extractedDetails = extractOpportunityDetails(summary);
    const location =
      text(metadata.location, 200) ||
      extractedDetails.Location ||
      extractedDetails.Country ||
      "";
    const duplicateKey = duplicateIdentity({
      title,
      category,
      location,
      deadline,
    });
    const existing = await payload.find({
      collection: "opportunities",
      where: {
        or: [
          { canonicalUrl: { equals: canonicalUrl } },
          ...(duplicateKey ? [{ duplicateKey: { equals: duplicateKey } }] : []),
        ],
      },
      limit: 1,
      depth: 1,
    });
    const previous = existing.docs[0];
    const previousSource =
      previous && typeof previous.source === "object" ? previous.source : null;
    const trust = { official: 3, verified: 2, unverified: 1 };
    if (
      previousSource &&
      previousSource.id !== source.id &&
      (trust[previousSource.trust] > trust[source.trust] ||
        (trust[previousSource.trust] === trust[source.trust] &&
          (previous?.summary.length ?? 0) >= summary.length))
    ) {
      continue;
    }
    const data = {
      title,
      summary,
      canonicalUrl,
      category,
      categories: classifications,
      duplicateKey,
      kind:
        metadata.kind === "news" ? ("news" as const) : ("opportunity" as const),
      status:
        deadline && Date.parse(deadline) <= Date.now()
          ? ("expired" as const)
          : ("published" as const),
      source: source.id,
      provider: text(metadata.provider, 200) || source.title,
      location,
      deadline,
      publishedAt: isoDate(item.date_published) ?? new Date().toISOString(),
      preferences: [
        ...new Set([
          ...(Array.isArray(item.tags)
            ? item.tags
                .filter((t): t is string => typeof t === "string")
                .slice(0, 20)
            : []),
          ...extractPreferences(category, `${title} ${summary} ${location}`),
        ]),
      ].slice(0, 30),
      details: Object.fromEntries(
        Object.entries({ ...extractedDetails, ...record(metadata.details) })
          .filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
          .slice(0, 20)
      ),
    };
    if (previous) {
      await payload.update({
        collection: "opportunities",
        id: previous.id,
        data,
      });
    } else {
      await payload.create({ collection: "opportunities", data });
      imported++;
    }
  }
  await payload.update({
    collection: "opportunity-sources",
    id: source.id,
    data: {
      lastFetchedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
      qualityScore: Math.min(100, 50 + Math.min(50, feed.items.length * 5)),
      lastError: null,
      itemsImported: (source.itemsImported ?? 0) + imported,
    },
  });
  const settings = await opportunitySettings(payload);
  if (settings.sourceDiscoveryEnabled) {
    await discoverLinkedSources(
      payload,
      feed,
      source.category,
      settings.minimumSourceQuality
    );
  }
  return imported;
}

/**
 * Discover declared JSON feeds from approved feeds. New domains remain quarantined
 * until staff approve them; feed quality alone cannot establish domain ownership.
 */
async function discoverLinkedSources(
  payload: Payload,
  feed: Record<string, unknown>,
  category: string,
  minimumQuality = 60
): Promise<void> {
  if (!Array.isArray(feed._newsspend_sources)) {
    return;
  }
  for (const value of feed._newsspend_sources.slice(0, 3)) {
    const candidate = record(value);
    if (typeof candidate.feed_url !== "string") {
      continue;
    }
    try {
      const feedUrl = canonicalize(candidate.feed_url);
      const existing = await payload.find({
        collection: "opportunity-sources",
        where: { feedUrl: { equals: feedUrl } },
        limit: 1,
      });
      if (existing.docs.length) {
        continue;
      }
      const discovered = record(await fetchPublicFeed(feedUrl));
      const validItems = Array.isArray(discovered.items)
        ? discovered.items.filter((item) => {
            const entry = record(item);
            return (
              typeof entry.title === "string" &&
              typeof entry.url === "string" &&
              new URL(entry.url).hostname === new URL(feedUrl).hostname
            );
          }).length
        : 0;
      const qualityScore = Math.min(100, 50 + Math.min(50, validItems * 5));
      if (
        !text(discovered.title, 200) ||
        validItems < 1 ||
        qualityScore < minimumQuality
      ) {
        continue;
      }
      await payload.create({
        collection: "opportunity-sources",
        data: {
          title: text(discovered.title, 200),
          feedUrl,
          category,
          status: "pending",
          trust: "unverified",
          ownershipReview: "unreviewed",
          qualityScore,
          lastValidatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      payload.logger.warn(
        { reason: error instanceof Error ? error.message : "Invalid source" },
        "For You discovered source rejected"
      );
    }
  }
}
