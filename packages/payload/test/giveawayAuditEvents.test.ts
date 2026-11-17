import { expect, test } from "bun:test";

import {
  AUDIT_EVENT_TYPE_OPTIONS,
  AUDIT_EVENT_TYPES,
} from "../src/collections/giveaway/constants";

test("manual_winner_added is an audit event type", () => {
  expect(AUDIT_EVENT_TYPES).toContain("manual_winner_added");
  expect(
    AUDIT_EVENT_TYPE_OPTIONS.some((o) => o.value === "manual_winner_added")
  ).toBe(true);
});
