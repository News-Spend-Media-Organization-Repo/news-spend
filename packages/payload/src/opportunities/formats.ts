import { DOMParser } from "@xmldom/xmldom";

export type FeedItem = {
  title: string;
  url: string;
  summary: string;
  date_published?: string;
  tags?: string[];
  _newsspend?: Record<string, unknown>;
};
export type ParsedFeed = {
  title?: string;
  items: FeedItem[];
  _newsspend_sources?: { feed_url: string }[];
};

function plain(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 10_000)
    : "";
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function sameDomain(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname === new URL(base).hostname
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Reject XML entity declarations entirely; never resolve external entities. */
function xmlFeed(body: string, base: string): ParsedFeed {
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) {
    throw new Error("XML document types and entities are not accepted");
  }
  const document = new DOMParser({
    onError: () => {
      throw new Error("Source contains invalid XML");
    },
  }).parseFromString(body, "application/xml");
  const entries = [
    ...Array.from(document.getElementsByTagName("item")),
    ...Array.from(document.getElementsByTagName("entry")),
  ].slice(0, 100);
  const items: FeedItem[] = [];
  for (const entry of entries) {
    const text = (name: string) =>
      entry.getElementsByTagName(name)[0]?.textContent ?? "";
    const links = Array.from(entry.getElementsByTagName("link"));
    const link =
      links.find((node) => node.getAttribute("rel") === "alternate") ??
      links[0];
    const url = sameDomain(
      link?.getAttribute("href") || link?.textContent || "",
      base
    );
    if (!url) {
      continue;
    }
    items.push({
      title: plain(text("title")),
      url,
      summary: plain(
        text("description") ||
          text("summary") ||
          text("content:encoded") ||
          text("content")
      ),
      date_published: text("pubDate") || text("published") || text("updated"),
      tags: Array.from(entry.getElementsByTagName("category"))
        .map((node) => node.getAttribute("term") || node.textContent || "")
        .filter(Boolean),
    });
  }
  return {
    title: plain(
      document.getElementsByTagName("title")[0]?.textContent ??
        new URL(base).hostname
    ),
    items,
  };
}

function htmlFeed(body: string, base: string): ParsedFeed {
  const items: FeedItem[] = [];
  const sources: { feed_url: string }[] = [];
  for (const match of body.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (
      !(
        /rel\s*=\s*["']alternate["']/i.test(tag) &&
        /application\/(?:rss\+xml|atom\+xml|feed\+json)/i.test(tag)
      )
    ) {
      continue;
    }
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const url = href && sameDomain(href, base);
    if (url) {
      sources.push({ feed_url: url });
    }
  }
  const process = (raw: unknown) => {
    if (items.length >= 100) {
      return;
    }
    if (Array.isArray(raw)) {
      raw.forEach(process);
      return;
    }
    const data = object(raw);
    if (Array.isArray(data["@graph"])) {
      data["@graph"].forEach(process);
    }
    const type = data["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (
      !types.some((value) =>
        [
          "JobPosting",
          "Scholarship",
          "Event",
          "EducationEvent",
          "Article",
          "NewsArticle",
          "Course",
        ].includes(String(value))
      )
    ) {
      return;
    }
    const url = sameDomain(
      String(data.url || object(data.mainEntityOfPage)["@id"] || base),
      base
    );
    const title = plain(data.title || data.headline || data.name);
    const summary = plain(data.description || data.articleBody);
    if (!(url && title && summary)) {
      return;
    }
    const location = object(data.jobLocation || data.location);
    const address = object(location.address);
    const provider = object(
      data.hiringOrganization || data.organizer || data.provider
    );
    items.push({
      title,
      summary,
      url,
      date_published: String(data.datePosted || data.datePublished || ""),
      _newsspend: {
        deadline: data.validThrough,
        kind: types.some((value) =>
          ["Article", "NewsArticle"].includes(String(value))
        )
          ? "news"
          : "opportunity",
        location: plain(
          address.addressCountry || location.name || address.addressLocality
        ),
        provider: plain(provider.name),
        details: Object.fromEntries(
          [
            ["Eligibility", plain(data.eligibility || data.qualifications)],
            ["Employment Type", plain(data.employmentType)],
            ["Work Arrangement", plain(data.jobLocationType)],
            ["Funding", plain(object(data.baseSalary).value)],
          ].filter(([, value]) => value)
        ),
      },
    });
  };
  for (const script of body.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      process(JSON.parse(script[1] ?? ""));
    } catch {
      /* Invalid publisher metadata is not executed. */
    }
  }
  return {
    title: plain(
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ??
        new URL(base).hostname
    ),
    items,
    _newsspend_sources: sources.slice(0, 3),
  };
}

export function parseSource(body: string, base: string): ParsedFeed {
  const start = body.trimStart();
  if (start.startsWith("{")) {
    const feed = object(JSON.parse(body));
    if (!Array.isArray(feed.items)) {
      throw new Error("JSON Feed must contain an items array");
    }
    return feed as ParsedFeed;
  }
  if (/<(?:rss\b|feed\b|rdf:RDF\b)/i.test(start)) {
    return xmlFeed(body, base);
  }
  if (/<html\b|<!doctype html/i.test(start)) {
    const feed = htmlFeed(body, base);
    if (!(feed.items.length || feed._newsspend_sources?.length)) {
      throw new Error(
        "HTML source has no supported structured opportunities or declared feeds"
      );
    }
    return feed;
  }
  throw new Error(
    "Use JSON Feed, RSS, Atom, or an HTML page with structured opportunity data"
  );
}
