import { describe, expect, test } from "bun:test";

import Categories from "../src/collections/Categories";
import { Media } from "../src/collections/Media";
import { guardReferencedDelete } from "../src/hooks/guardReferencedDelete";

const run = (refs: number) =>
  guardReferencedDelete("media")({
    id: "00000000-0000-0000-0000-000000000001",
    req: {
      payload: {
        db: { drizzle: { execute: async () => ({ rows: [{ refs }] }) } },
      },
    },
  } as never);

describe("guardReferencedDelete", () => {
  test("refuses a delete while other rows still point at the document", async () => {
    await expect(run(3)).rejects.toThrow("3 record(s)");
  });

  test("allows a delete once nothing references it", async () => {
    await expect(run(0)).resolves.toBeUndefined();
  });

  test("is wired into the collections whose delete blanks required relations", () => {
    expect(Categories.hooks?.beforeDelete).toHaveLength(1);
    expect(Media.hooks?.beforeDelete).toHaveLength(1);
  });
});
