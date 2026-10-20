import { describe, expect, test } from "bun:test";

import News from "../src/collections/News";
import { PartnerContent } from "../src/collections/PartnerContent";
import { activityPoints, MAX_ACTIVITY_POINTS } from "../src/lib/activityPoints";

type FieldLike = {
  name?: string;
  fields?: FieldLike[];
  tabs?: { fields: FieldLike[] }[];
};

function pointsField(fields: FieldLike[]): FieldLike | undefined {
  for (const field of fields) {
    if (field.name === "points") {
      return field;
    }
    const nested = [
      ...(field.fields ?? []),
      ...(field.tabs ?? []).flatMap((tab) => tab.fields),
    ];
    const found = pointsField(nested);
    if (found) {
      return found;
    }
  }
}

describe("activity point ceiling", () => {
  test("accepts 0 to the ceiling and refuses everything else", () => {
    expect(activityPoints(null)).toBe(0);
    expect(activityPoints(undefined)).toBe(0);
    expect(activityPoints(0)).toBe(0);
    expect(activityPoints(MAX_ACTIVITY_POINTS)).toBe(MAX_ACTIVITY_POINTS);
    expect(activityPoints(-1)).toBeNull();
    expect(activityPoints(MAX_ACTIVITY_POINTS + 1)).toBeNull();
    expect(activityPoints("5000")).toBeNull();
    expect(activityPoints(Number.NaN)).toBeNull();
  });

  test("news and partner content cannot be saved above the ceiling", () => {
    expect(pointsField(News.fields as FieldLike[])).toMatchObject({
      min: 0,
      max: MAX_ACTIVITY_POINTS,
    });
    expect(pointsField(PartnerContent.fields as FieldLike[])).toMatchObject({
      min: 0,
      max: MAX_ACTIVITY_POINTS,
    });
  });
});
