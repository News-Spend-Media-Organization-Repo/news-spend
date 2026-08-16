# Integration tests

These run against a **real Payload instance on a real Postgres**, so collection
hooks, field validation and the engine all execute together.

```bash
bun run --filter @news-spend-media/payload test:integration
```

They are deliberately not part of `bun test` / `turbo test`. Booting Payload and
pushing the schema costs ~15 seconds, which does not belong in a pre-commit
hook. The fast unit tests in `packages/api/test` stay where they are.

## Why they exist

The unit tests run against a hand-written `payload` stand-in — an object with
`find`, `findByID`, `create` and `update` on it. That is the right tool for pure
logic and it is fast, but it has **no collection hooks**, so anything that
depends on them is invisible to it.

That gap shipped a real bug. The §5 prize-pool lock refuses writes to
`giveaway-prizes` while a giveaway sits in a locked status, and the draw engine
writes `unitsAwarded` to that collection *while the giveaway is
`draw_in_progress`*. The lock stopped the engine one write after the first
winner, so no draw could ever complete. 633 unit tests passed throughout,
because the fake payload never ran the hook.

`giveawayDraw.int.test.ts` fails with that exact error if the fix is reverted.

## Database

`TEST_DATABASE_URI` must name a database called exactly `newsspend_test`. The
helper refuses anything else and creates it if missing.

The check is a whole-name match, not a suffix: these tests let Drizzle **push**
the schema, which rewrites whatever it is aimed at. Pointed at `newsspend`, it
would rewrite the development database, which nothing automated in this repo is
allowed to touch.

For the same reason `NODE_ENV` must not be `production` — that swaps push for
`prodMigrations` (see `@payloadcms/db-postgres`'s `connect`), and the point here
is to test the collections exactly as they are configured right now.

## Credentials

`testPayload.ts` **overwrites** every credential the config reads — it does not
default them. Bun loads `.env` from the working directory before any test code
runs, and `packages/payload/.env` holds a live Resend key. An earlier version of
this helper used `||=`, left the real key in place, and sent three §21 Winner
Reports to `reward@newsspend.com` from a test run.

Tests that touch the Winner Report should also inject a `reportSender` into
`GiveawayEngine`, as `giveawayDraw.int.test.ts` does. The stubbed key is the
outer guard; the injected sender is the one that states the intent.
