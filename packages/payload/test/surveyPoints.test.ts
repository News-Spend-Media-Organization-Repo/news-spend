import { describe, expect, it } from "bun:test";

import { Survey } from "../src/collections/Survey";
import { MAX_SURVEY_POINTS } from "../src/lib/surveyPoints";

describe("the Survey points field", () => {
  const field = Survey.fields.find((f) => "name" in f && f.name === "points") as
    | { type: string; min?: number; max?: number }
    | undefined;

  it("cannot be saved above the maximum a survey may pay", () => {
    expect(field).toMatchObject({ type: "number", max: MAX_SURVEY_POINTS });
  });

  it("cannot be saved negative", () => {
    expect(field?.min).toBe(0);
  });

  it("keeps the maximum modest, since normal surveys pay hundreds", () => {
    expect(MAX_SURVEY_POINTS).toBe(5000);
  });
});
