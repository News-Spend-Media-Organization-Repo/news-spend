import { describe, expect, test } from "vitest";

import {
  sendTemplatedEmail,
  TemplateNotFoundError,
} from "./sendTemplatedEmail";

describe("sendTemplatedEmail", () => {
  test("throws TemplateNotFoundError when the slug has no template", async () => {
    const payload = {
      find: async () => ({ docs: [] }),
    };

    await expect(
      sendTemplatedEmail(payload as never, {
        slug: "welcome",
        to: "ada@example.com",
        variables: {},
      })
    ).rejects.toBeInstanceOf(TemplateNotFoundError);
  });

  test("throws TemplateNotFoundError when the template has no HTML", async () => {
    const payload = {
      find: async () => ({ docs: [{ html: null, subject: "Hi" }] }),
    };

    await expect(
      sendTemplatedEmail(payload as never, {
        slug: "welcome",
        to: "ada@example.com",
        variables: {},
      })
    ).rejects.toBeInstanceOf(TemplateNotFoundError);
  });

  test("looks up published templates only", async () => {
    let seenWhere: unknown;
    const payload = {
      find: async (args: { where: unknown }) => {
        seenWhere = args.where;
        return { docs: [] };
      },
    };

    await expect(
      sendTemplatedEmail(payload as never, {
        slug: "welcome",
        to: "ada@example.com",
        variables: {},
      })
    ).rejects.toBeInstanceOf(TemplateNotFoundError);
    expect(seenWhere).toEqual({
      and: [
        { slug: { equals: "welcome" } },
        { _status: { equals: "published" } },
      ],
    });
  });
});
