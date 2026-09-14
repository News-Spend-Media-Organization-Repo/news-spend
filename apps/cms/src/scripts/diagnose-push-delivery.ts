/**
 * Diagnose why a user is not receiving push notifications. READ-ONLY: only
 * `find`/`count` calls, nothing is created, updated, or deleted.
 *
 * Answers, for one user identified by email or id:
 *   - do they have push-token rows, and are they active or stale?
 *   - are their notification type preferences on for what is being sent?
 *   - what do their recent delivery rows say (delivered, failed + why)?
 *
 * Usage, from apps/cms:
 *
 *   bun run src/scripts/diagnose-push-delivery.ts --email someone@example.com
 *   bun run src/scripts/diagnose-push-delivery.ts --user-id <uuid>
 *
 * TARGETING A DEPLOYED ENVIRONMENT
 *
 * Set DATABASE_URI to that environment and NODE_ENV=production:
 *
 *   DATABASE_URI=<prod uri> NODE_ENV=production \
 *     bun run src/scripts/diagnose-push-delivery.ts --email someone@example.com
 *
 * The NODE_ENV is not optional and the script refuses without it. Payload's
 * Postgres adapter pushes the schema whenever NODE_ENV is anything else, so a
 * local run pointed at production would rewrite that database's schema from
 * whatever happens to be checked out. `production` takes the migration path
 * instead, which is a no-op against an up-to-date environment.
 */

import { getPayload } from "@news-spend-media/payload";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const LOCAL_DB_RE = /@(localhost|127\.0\.0\.1)[:/]/;

function assertSafeTarget(): void {
  const uri = process.env.DATABASE_URI ?? "";
  const isLocal = LOCAL_DB_RE.test(uri);

  if (!(isLocal || process.env.NODE_ENV === "production")) {
    throw new Error(
      "Refusing to run against a non-local database without NODE_ENV=production.\n" +
        "Payload pushes its schema in any other mode, which would rewrite the " +
        "target environment's schema from your working copy."
    );
  }
}

function shortToken(token: unknown): string {
  return typeof token === "string" && token.length > 16
    ? `${token.slice(0, 12)}…`
    : String(token);
}

async function main() {
  assertSafeTarget();

  const email = argValue("--email");
  const userId = argValue("--user-id");
  if (!(email || userId)) {
    throw new Error("Pass --email <address> or --user-id <id>.");
  }

  const payload = await getPayload();

  const users = await payload.find({
    collection: "users",
    where: email ? { email: { equals: email } } : { id: { equals: userId } },
    limit: 2,
    depth: 0,
  });

  if (users.totalDocs === 0) {
    console.log("No user found.");
    return;
  }
  if (users.totalDocs > 1) {
    console.log(`Multiple users match; refine the query (${users.totalDocs}).`);
    return;
  }

  const user = users.docs[0] as {
    id: string;
    email?: string | null;
    notificationPreferences?: { types?: Record<string, boolean> } | null;
  };
  console.log(`\nUser ${user.id} <${user.email ?? "no email"}>`);
  console.log(
    `Preferences: ${JSON.stringify(user.notificationPreferences?.types ?? null)}`
  );

  const tokens = await payload.find({
    collection: "push-tokens",
    where: { user: { equals: user.id } },
    sort: "-updatedAt",
    limit: 20,
    depth: 0,
  });

  console.log(`\nPush tokens: ${tokens.totalDocs}`);
  for (const row of tokens.docs) {
    const token = row as {
      token?: unknown;
      status?: unknown;
      deviceType?: unknown;
      appVersion?: unknown;
      lastUsed?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
    };
    console.log(
      `- ${shortToken(token.token)} status=${String(token.status)} device=${String(token.deviceType)} app=${String(token.appVersion)} lastUsed=${String(token.lastUsed)} created=${String(token.createdAt)}`
    );
  }
  if (tokens.totalDocs === 0) {
    console.log(
      "No token rows: this device never registered (or the row was deleted " +
        "after an Expo DeviceNotRegistered rejection). Nothing can be delivered."
    );
  }

  const deliveries = await payload.find({
    collection: "notification-deliveries",
    where: { user: { equals: user.id } },
    sort: "-createdAt",
    limit: 10,
    depth: 1,
  });

  console.log(`\nRecent deliveries: ${deliveries.totalDocs} (latest 10 shown)`);
  for (const row of deliveries.docs) {
    const delivery = row as {
      status?: unknown;
      errorMessage?: unknown;
      createdAt?: unknown;
      notification?: { title?: unknown } | string | null;
    };
    const title =
      delivery.notification && typeof delivery.notification === "object"
        ? String(delivery.notification.title ?? delivery.notification)
        : String(delivery.notification);
    console.log(
      `- ${String(delivery.createdAt)} [${String(delivery.status)}] ${title}${delivery.errorMessage ? ` error=${String(delivery.errorMessage)}` : ""}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
