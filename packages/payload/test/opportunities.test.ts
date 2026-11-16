import { describe, expect, it } from "bun:test";
import { canonicalize, learnedInterests, rankOpportunities } from "../src/opportunities/engine";
import { classifyContent, isPublicIPv4 } from "../src/opportunities/ingestion";
import { DEFAULT_PROFILE, readProfile } from "../src/opportunities/model";
import type { OpportunityContent, OpportunityProfile } from "../src/opportunities/model";
import { opportunityCollections } from "../src/collections/Opportunities";

const now = Date.parse("2026-11-15T12:00:00Z");
const profile: OpportunityProfile = { ...DEFAULT_PROFILE, interests: ["jobs"], personalized: true, consent: true };
const item = (id: string, changes: Partial<OpportunityContent> = {}): OpportunityContent => ({
  id, title: `Opportunity ${id}`, summary: "A useful opportunity", category: "jobs", kind: "opportunity",
  canonicalUrl: `https://example.org/${id}`, provider: "Official provider", location: "Canada",
  preferences: [], details: {}, deadline: null, publishedAt: "2026-11-14T12:00:00Z", trust: "official", popularity: 0, ...changes,
});

describe("For You ranking", () => {
  it("prioritizes explicit interests", () => {
    const result = rankOpportunities([item("other", { category: "funding" }), item("job")], profile, [], now);
    expect(result[0]?.id).toBe("job");
    expect(result[0]).not.toHaveProperty("score");
  });
  it("removes expired opportunities but retains items without a deadline", () => {
    expect(rankOpportunities([item("expired", { deadline: "2026-11-14" }), item("open")], profile, [], now).map((i) => i.id)).toEqual(["open"]);
  });
  it("deduplicates canonical URLs and prefers the official source", () => {
    const result = rankOpportunities([
      item("blog", { canonicalUrl: "https://example.org/program?utm_source=blog", trust: "unverified" }),
      item("official", { canonicalUrl: "https://example.org/program" }),
    ], profile, [], now);
    expect(result.map((i) => i.id)).toEqual(["official"]);
  });
  it("targets 80/20 discovery when sufficient content exists", () => {
    const content = Array.from({ length: 30 }, (_, i) => item(String(i), { category: i < 20 ? "jobs" : "funding" }));
    const result = rankOpportunities(content, profile, [], now).slice(0, 20);
    expect(result.filter((i) => i.discovery)).toHaveLength(4);
  });
  it("does not use inferred interests when consent is off", () => {
    const result = rankOpportunities([item("a"), item("b", { category: "funding" })], { ...profile, consent: false }, [{ opportunityId: "a", category: "jobs", action: "dismiss" }], now);
    expect(result).toHaveLength(2);
    expect(result.every((i) => !i.discovery && i.reason === "Latest and trending opportunities")).toBe(true);
  });
  it("honors not interested when personalization is enabled", () => {
    expect(rankOpportunities([item("a")], profile, [{ opportunityId: "a", category: "jobs", action: "dismiss" }], now)).toEqual([]);
  });
  it("keeps selected interests intact when behaviour changes", () => {
    rankOpportunities([item("a", { category: "education" })], profile, [{ opportunityId: "a", category: "education", action: "save" }], now);
    expect(profile.interests).toEqual(["jobs"]);
  });
  it("bounds learned interest strength", () => {
    expect(learnedInterests(Array.from({ length: 100 }, () => ({ opportunityId: "a", category: "jobs", action: "more" as const })))).toEqual({ jobs: 30 });
  });
  it("rejects insecure URLs", () => {
    expect(() => canonicalize("http://example.org")).toThrow();
    expect(() => canonicalize("https://user:password@example.org")).toThrow();
  });
  it("recovers safely from malformed stored profiles", () => {
    expect(readProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(readProfile({ interests: ["jobs", 123], preferences: { jobs: ["IT & Digital", false] } }).interests).toEqual(["jobs"]);
  });
});
describe("Source safety", () => {
  it("blocks private and special-use IP addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
      expect(isPublicIPv4(ip)).toBe(false);
    }
    expect(isPublicIPv4("8.8.8.8")).toBe(true);
  });
  it("classifies common opportunity types without inventing deadlines", () => {
    expect(classifyContent("Graduate Scholarship", "Apply for tuition funding", "technology")).toBe("education");
    expect(classifyContent("Express Entry Update", "New immigration program", "jobs")).toBe("immigration");
    expect(classifyContent("Announcement", "A provider update", "career")).toBe("career");
  });
});
describe("Consumer data access", () => {
  it("does not allow public writes to any For You collection", async () => {
    for (const collection of opportunityCollections) {
      for (const op of ["create", "update", "delete"] as const) {
        const access = collection.access?.[op];
        expect(typeof access === "function" ? await access({ req: { user: null } } as never) : access).toBe(false);
      }
    }
  });
  it("scopes private records to the current user", async () => {
    const access = opportunityCollections.find((c) => c.slug === "saved-opportunities")?.access?.read;
    expect(typeof access === "function" ? await access({ req: { user: { id: "u1", collection: "users" } } } as never) : null).toEqual({ user: { equals: "u1" } });
  });
});
