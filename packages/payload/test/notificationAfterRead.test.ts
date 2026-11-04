import { describe, expect, it } from "bun:test";
import Notifications from "../src/collections/Notifications";

/**
 * Payload calls collection afterRead hooks for version snapshots with the
 * version body, which has no `id`. The virtual counts must not query with it.
 */
describe("Notifications afterRead", () => {
  it("skips the counts for a version snapshot", async () => {
    const [hook] = Notifications.hooks?.afterRead ?? [];
    if (!hook) {
      throw new Error("afterRead hook missing");
    }

    let queried = false;
    const req = {
      payload: {
        count: async () => {
          queried = true;
          return { totalDocs: 0 };
        },
      },
    };

    const doc = { title: "A version snapshot", body: "No id here" };
    const result = await (hook as (args: unknown) => Promise<unknown>)({
      doc,
      req,
    });

    expect(result).toBe(doc);
    expect(queried).toBe(false);
  });
});
