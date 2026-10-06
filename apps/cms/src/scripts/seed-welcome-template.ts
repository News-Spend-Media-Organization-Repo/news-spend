/**
 * Seed the CMS `welcome` email template (visual studio source).
 *
 * Usage, from apps/cms:
 *
 *   bun run src/scripts/seed-welcome-template.ts        # dry run
 *   bun run src/scripts/seed-welcome-template.ts --write
 */

import { getPayload } from "@news-spend-media/payload";

const WRITE = process.argv.includes("--write");

const SLUG = "welcome";

// Legacy comparison rows from the blocks-vs-visual spike.
const LEGACY_KEYS = ["welcome-blocks", "welcome-visual"];

const visualHtml = [
  '<div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">',
  "  <h1>Hi {{username}}</h1>",
  "  <h2>Welcome to Newsspend Media</h2>",
  "  <p>Today isn't just a welcome. It's the beginning of something bigger.</p>",
  "  <p>You've just stepped into a platform designed to transform your everyday digital life into real-world progress, rewards, and opportunities.</p>",
  "  <h2>How it works</h2>",
  "  <p>Do what you already love, and get rewarded: read meaningful content, watch and share engaging videos, complete simple tasks and surveys. Every interaction moves you toward your dream.</p>",
  "  <hr />",
  "  <p>Need support? Contact us at support@newsspend.com. Points reset every 12 months, so make the most of every opportunity to earn and grow.</p>",
  "</div>",
].join("\n");

async function main() {
  const payload = await getPayload();

  console.log(`\n${WRITE ? "WRITE" : "DRY RUN: nothing will be changed"}\n`);

  const all = await payload.find({
    collection: "email-templates",
    limit: 100,
    pagination: false,
    depth: 0,
  });

  for (const doc of all.docs) {
    const row = doc as unknown as { slug?: unknown; key?: unknown };
    const id = String(doc.id);
    const label =
      typeof row.slug === "string"
        ? row.slug
        : typeof row.key === "string"
          ? row.key
          : null;
    if (!(label && [...LEGACY_KEYS, SLUG].includes(label))) {
      continue;
    }
    // The canonical `welcome` row is recreated below; drop everything
    // from the spike so only one row remains.
    if (!WRITE) {
      console.log(`  delete   email-template  ${label} (spike row)`);
      continue;
    }
    await payload.delete({ collection: "email-templates", id });
    console.log(`  deleted  email-template  ${label} (spike row)`);
  }
  if (WRITE) {
    await payload.create({
      collection: "email-templates",
      // Published: senders read published templates only.
      data: {
        _status: "published",
        name: "Welcome",
        slug: SLUG,
        subject: "Welcome to News-Spend Media",
        previewText: "Welcome to Newsspend Media. Today is just the beginning.",
        html: visualHtml,
      } as never,
    });
    console.log(`  created  email-template  ${SLUG}`);
  } else {
    console.log(`  create   email-template  ${SLUG}`);
  }

  console.log(
    WRITE
      ? "\n  Ready. Preview via GET /api/email-templates/:id/preview.\n"
      : "\nRe-run with --write to apply.\n"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
