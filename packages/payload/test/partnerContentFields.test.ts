import { describe, expect, test } from "bun:test";
import type { CollectionConfig, Field } from "payload";
import { PartnerContent } from "../src/collections/PartnerContent";
import { PartnerConversions } from "../src/collections/PartnerConversions";
import { Partners } from "../src/collections/Partners";

type NamedField = Field & { name: string };

const flatten = (fields: Field[]): Field[] =>
  fields.flatMap((field) => {
    if (field.type === "tabs") {
      return field.tabs.flatMap((tab) => flatten(tab.fields));
    }
    if (field.type === "collapsible" || field.type === "row") {
      return [field, ...flatten(field.fields)];
    }
    return [field];
  });

const find = (collection: CollectionConfig, name: string) =>
  flatten(collection.fields).find(
    (field): field is NamedField => "name" in field && field.name === name
  );

const REMOVED = [
  "discover-tab",
  "shop-tab",
  "product-display",
  "push-notification",
  "email-campaign",
];

const KEPT = [
  "homepage-trending-books",
  "homepage-ads-banner",
  "points-mall-books",
  "points-mall-apps",
  "connect-brand-video",
  "connect-brands-tab",
  "lucky-app-wall",
  "news-click-ads",
  "banner-news-post",
  "news-post",
  "video-section",
];

describe("partner content fields", () => {
  test("placements picker drops the five unused options and keeps the rest", () => {
    const field = find(PartnerContent, "placements");
    if (field?.type !== "select") {
      throw new Error("placements select missing");
    }
    const values = field.options.map((o) =>
      typeof o === "string" ? o : o.value
    );
    for (const removed of REMOVED) {
      expect(values).not.toContain(removed);
    }
    expect([...values].sort()).toEqual([...KEPT].sort());
  });

  test("adCopy is an optional text field", () => {
    const field = find(PartnerContent, "adCopy");
    expect(field?.type).toBe("text");
    expect(field?.required).toBeFalsy();
  });

  test("condition and points are relabelled", () => {
    expect(find(PartnerContent, "condition")?.label).toBe(
      "Offer copy (earn surfaces only)"
    );
    expect(find(PartnerContent, "points")?.label).toBe("Offer points");
  });

  test("partners.confirmationDays defaults to 7", () => {
    const field = find(Partners, "confirmationDays");
    expect(field?.type).toBe("number");
    expect(field?.defaultValue).toBe(7);
  });

  test("partner-conversions.surface is an indexed text field", () => {
    const field = find(PartnerConversions, "surface");
    expect(field?.type).toBe("text");
    expect(field?.index).toBe(true);
  });
});
