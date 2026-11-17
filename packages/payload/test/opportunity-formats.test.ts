import { describe, expect, it } from "bun:test";
import {
  duplicateIdentity,
  rankOpportunities,
} from "../src/opportunities/engine";
import { parseSource } from "../src/opportunities/formats";
import {
  classifyCategories,
  extractDeadline,
  extractOpportunityDetails,
  extractPreferences,
} from "../src/opportunities/ingestion";
import {
  DEFAULT_PROFILE,
  type OpportunityContent,
} from "../src/opportunities/model";

describe("For You source formats", () => {
  it("parses JSON Feed without discarding provider metadata", () => {
    const feed = parseSource(
      JSON.stringify({
        title: "Opportunities",
        items: [
          {
            title: "Example",
            url: "https://example.org/a",
            summary: "A program",
            _newsspend: { deadline: "2027-03-01" },
          },
        ],
      }),
      "https://example.org/feed"
    );
    expect(feed.items[0]?._newsspend?.deadline).toBe("2027-03-01");
  });
  it("parses RSS titles, summaries and published dates", () => {
    const feed = parseSource(
      "<rss><channel><title>Example</title><item><title>Training Scholarship</title><link>https://example.org/a</link><description><![CDATA[<p>A funded course.</p>]]></description><pubDate>Mon, 01 Feb 2027 10:00:00 GMT</pubDate></item></channel></rss>",
      "https://example.org/rss"
    );
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]?.summary).toBe("A funded course.");
    expect(feed.items[0]?.date_published).toContain("2027");
  });
  it("parses Atom alternate links and category terms", () => {
    const feed = parseSource(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>Example</title><entry><title>Software Fellowship</title><link rel="alternate" href="/fellowship"/><summary>Learn software</summary><category term="Software &amp; Cloud"/></entry></feed>',
      "https://example.org/atom"
    );
    expect(feed.items[0]?.url).toBe("https://example.org/fellowship");
    expect(feed.items[0]?.tags).toContain("Software & Cloud");
  });
  it("rejects XML entity and document-type declarations", () => {
    expect(() =>
      parseSource(
        '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel/></rss>',
        "https://example.org/rss"
      )
    ).toThrow("entities");
  });
  it("does not accept links to arbitrary third-party destinations", () => {
    const feed = parseSource(
      "<rss><channel><item><title>Suspicious</title><link>https://different.example/a</link><description>Example</description></item></channel></rss>",
      "https://example.org/rss"
    );
    expect(feed.items).toHaveLength(0);
  });
  it("extracts typed HTML structured data without executing scripts", () => {
    const feed = parseSource(
      '<html><head><title>Jobs</title><script type="application/ld+json">{"@type":"JobPosting","title":"Software Developer","description":"Build useful applications","url":"/jobs/one","validThrough":"2027-03-01","qualifications":"Relevant experience","jobLocation":{"address":{"addressCountry":"Canada"}}}</script></head></html>',
      "https://example.org/jobs"
    );
    expect(feed.items[0]?.title).toBe("Software Developer");
    expect(feed.items[0]?._newsspend?.deadline).toBe("2027-03-01");
    expect(feed.items[0]?._newsspend?.location).toBe("Canada");
  });
  it("discovers only declared same-domain feeds from HTML", () => {
    const feed = parseSource(
      '<!doctype html><html><head><link rel="alternate" type="application/rss+xml" href="/feed"/><link rel="alternate" type="application/rss+xml" href="https://another.example/feed"/></head></html>',
      "https://example.org"
    );
    expect(feed._newsspend_sources).toEqual([
      { feed_url: "https://example.org/feed" },
    ]);
  });
  it("fails explicitly when a page has no supported content", () => {
    expect(() =>
      parseSource(
        "<html><head><title>Empty</title></head></html>",
        "https://example.org"
      )
    ).toThrow("structured");
  });
  it("extracts only stated absolute deadlines", () => {
    expect(
      extractDeadline("Deadline: March 12, 2027. Apply at the official source.")
    ).toContain("2027-03-12");
    expect(extractDeadline("Applications close soon")).toBeNull();
    expect(extractDeadline("Deadline: March 12")).toBeNull();
    expect(extractDeadline("Published: 2027-03-12")).toBeNull();
  });
  it("assigns multiple relevant classifications", () => {
    expect(
      classifyCategories(
        "Artificial intelligence scholarship",
        "Graduate tuition support",
        "jobs"
      )
    ).toEqual(expect.arrayContaining(["education", "technology", "ai"]));
  });
  it("extracts stated requirements and category-specific preferences", () => {
    expect(
      extractOpportunityDetails(
        "Eligibility: Graduate students; Funding: Full tuition; Country: Canada."
      )
    ).toEqual({
      Eligibility: "Graduate students",
      Funding: "Full tuition",
      Country: "Canada",
    });
    expect(
      extractPreferences(
        "jobs",
        "Business analyst working with technical support teams"
      )
    ).toContain("Business & Governance");
    expect(
      extractPreferences("immigration", "Canada and United Kingdom updates")
    ).toEqual(["Canada", "United Kingdom"]);
    expect(extractPreferences("technology", "AI software and cloud")).toEqual(
      expect.arrayContaining(["AI & Data", "Software & Cloud"])
    );
  });
});

describe("cross-source opportunity identity", () => {
  const base: OpportunityContent = {
    id: "a",
    title: "Global Digital Skills Scholarship 2027",
    summary: "Funded program",
    category: "education",
    kind: "opportunity",
    canonicalUrl: "https://blog.example/a",
    provider: "Example",
    location: "Canada",
    preferences: [],
    details: {},
    deadline: "2027-03-01T00:00:00Z",
    publishedAt: "2026-11-15T00:00:00Z",
    trust: "unverified",
    popularity: 0,
  };
  it("consolidates word-order duplicates and keeps the official version", () => {
    const official = {
      ...base,
      id: "official",
      title: "Scholarship 2027 Global Digital Skills",
      canonicalUrl: "https://official.example/scholarship",
      trust: "official" as const,
    };
    expect(duplicateIdentity(base)).toBe(duplicateIdentity(official));
    const result = rankOpportunities(
      [base, official],
      DEFAULT_PROFILE,
      [],
      Date.parse("2026-11-15")
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("official");
  });
  it("does not merge opportunities with different deadlines", () => {
    expect(duplicateIdentity(base)).not.toBe(
      duplicateIdentity({ ...base, deadline: "2027-04-01" })
    );
  });
  it("does not invent an identity for generic or incomplete items", () => {
    expect(duplicateIdentity({ ...base, title: "Scholarship" })).toBeNull();
    expect(duplicateIdentity({ ...base, deadline: null })).toBeNull();
  });
  it("honors the configurable featured-content boost", () => {
    const second = {
      ...base,
      id: "featured",
      title: "Another different program for readers",
      deadline: null,
      canonicalUrl: "https://example.org/b",
      featured: true,
    };
    const result = rankOpportunities(
      [base, second],
      DEFAULT_PROFILE,
      [],
      Date.parse("2026-11-15"),
      { featuredBoost: 30 }
    );
    expect(result[0]?.id).toBe("featured");
  });
});
