import { describe, expect, test } from "bun:test";
import type { Field } from "payload";
import { isStaff } from "../src/access/adminRoles";
import { PartnerContentEvents } from "../src/collections/PartnerContentEvents";
import { prunePartnerContentEventsTask } from "../src/tasks/prunePartnerContentEvents";

const find = (name: string) =>
  PartnerContentEvents.fields.find(
    (field): field is Field & { name: string } =>
      "name" in field && field.name === name
  );

describe("partner-content-events collection", () => {
  test("slug and access", async () => {
    expect(PartnerContentEvents.slug).toBe("partner-content-events");
    expect(PartnerContentEvents.access?.read).toBe(isStaff);
    expect(PartnerContentEvents.access?.delete).toBe(isStaff);
    const create = PartnerContentEvents.access?.create;
    const update = PartnerContentEvents.access?.update;
    expect(await create?.({} as never)).toBe(false);
    expect(await update?.({} as never)).toBe(false);
  });

  test("event is exactly impression or click", () => {
    const event = find("event");
    expect(event?.type).toBe("select");
    const options =
      event?.type === "select"
        ? event.options.map((o) => (typeof o === "string" ? o : o.value))
        : [];
    expect(options).toEqual(["impression", "click"]);
  });

  test("dedupe indexes", () => {
    const dedupeKey = find("dedupeKey");
    expect(dedupeKey && "unique" in dedupeKey && dedupeKey.unique).toBe(true);
    const indexes = PartnerContentEvents.indexes ?? [];
    const has = (fields: string[], unique?: boolean) =>
      indexes.some(
        (i) =>
          JSON.stringify(i.fields) === JSON.stringify(fields) &&
          (unique === undefined || Boolean(i.unique) === unique)
      );
    expect(has(["deviceId", "eventId"], true)).toBe(true);
    expect(has(["partner", "timestamp"])).toBe(true);
    expect(has(["content", "timestamp"])).toBe(true);
  });
});

describe("prunePartnerContentEvents task", () => {
  test("slug and schedule", () => {
    expect(prunePartnerContentEventsTask.slug).toBe(
      "prunePartnerContentEvents"
    );
    expect(prunePartnerContentEventsTask.schedule).toEqual([
      { cron: "30 4 * * *", queue: "maintenance" },
    ]);
  });
});
