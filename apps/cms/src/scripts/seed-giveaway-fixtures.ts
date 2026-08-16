/**
 * Seed the records a giveaway needs before anything about it can be tested.
 *
 * A fresh environment has an empty Master Prize Catalogue and no partner
 * content, and that single gap blocks most of the engine from ever running:
 *
 *   - Boosts (§7) need Connect Brands content. Without it `BoostLuck` can only
 *     refuse, because the engine will not count an engagement it cannot
 *     attribute to a specific item.
 *   - Featured Offers (§8) need Lucky App Wall content, for the same reason.
 *   - Tier 1 and Tier 2 need BOTH of the above, so neither is reachable at all.
 *   - The giveaway reveal plays a Connect Brands advertisement before showing
 *     the outcome, and falls straight through to the result without one.
 *   - Reloadly fulfilment (§15) needs an airtime or data prize to exist. It had
 *     never executed in any environment before this script.
 *
 * Everything is created through Payload's local API rather than SQL, so the
 * collection hooks run: the catalogue tier rules, the one-active-giveaway
 * constraint and the prize-pool lock all apply exactly as they would to an
 * administrator working in the CMS.
 *
 * IDEMPOTENT. Records are matched by name and skipped if present, so a second
 * run reports "exists" rather than creating duplicates. It never edits or
 * deletes anything it did not create.
 *
 * Usage, from apps/cms:
 *
 *   bun run src/scripts/seed-giveaway-fixtures.ts
 *       Report what would change. Touches nothing.
 *
 *   bun run src/scripts/seed-giveaway-fixtures.ts --write
 *       Create the missing records.
 *
 * Add --with-giveaway to also create an active giveaway wired to the prizes.
 * Left out by default because only one giveaway may be active at a time, and
 * an environment that already has one would be refused by the hook.
 *
 * TARGETING A DEPLOYED ENVIRONMENT
 *
 * Set DATABASE_URI to that environment and NODE_ENV=production:
 *
 *   DATABASE_URI=<staging uri> NODE_ENV=production \
 *     bun run src/scripts/seed-giveaway-fixtures.ts --write
 *
 * The NODE_ENV is not optional and the script refuses without it. Payload's
 * Postgres adapter pushes the schema whenever NODE_ENV is anything else, so a
 * local run pointed at staging would rewrite that database's schema from
 * whatever happens to be checked out. `production` takes the migration path
 * instead, which is a no-op against an up-to-date environment.
 */

import { getPayload } from "@news-spend-media/payload";

const WRITE = process.argv.includes("--write");
const WITH_GIVEAWAY = process.argv.includes("--with-giveaway");

type CatalogueEntry = {
  name: string;
  tier: "tier1" | "tier2" | "tier3";
  fulfilmentType: "points" | "airtime" | "data" | "physical";
  description: string;
  pointsAmount?: number;
  /**
   * What Reloadly is asked to send, in naira. Airtime operators take a range
   * rather than fixed denominations, so this is sent verbatim — see
   * `fulfilPrizes`, which reads `reloadlyLocalAmount` before `valueNaira`.
   */
  reloadlyLocalAmount?: number;
  valueNaira?: number;
};

const CATALOGUE: CatalogueEntry[] = [
  {
    /**
     * Tier 1 is only reachable with 10 tickets, 3 boosts and a Featured Offer
     * (§11), so this prize is unawardable until the partner content below has
     * actually been engaged with. Points rather than a physical item on
     * purpose: the tier is about eligibility, and a physical claim would add
     * an address step and possibly identity verification to a test that is not
     * about either.
     */
    name: "5,000 Dream Points",
    tier: "tier1",
    fulfilmentType: "points",
    description: "The high-tier prize. Credited on claim.",
    pointsAmount: 5000,
    valueNaira: 5000,
  },
  {
    name: "500 Dream Points",
    tier: "tier3",
    fulfilmentType: "points",
    description: "Credited to the winner the moment they claim.",
    pointsAmount: 500,
    valueNaira: 500,
  },
  {
    /**
     * The reason this script exists. Airtime is the only prize type that
     * reaches Reloadly on a claim, and that path had never run anywhere —
     * dev, staging or production.
     */
    name: "₦500 Airtime",
    tier: "tier3",
    fulfilmentType: "airtime",
    description: "Sent to the winner's phone number on the network it detects.",
    reloadlyLocalAmount: 500,
    valueNaira: 500,
  },
];

type PartnerItem = {
  title: string;
  placement: "connect-brand-video" | "lucky-app-wall";
  type: "video" | "app";
  condition: string;
  points: number;
  why: string;
};

/**
 * Partner content cannot be conjured from nothing: `media` is a required
 * upload and `partner` a required relationship, so this reuses whatever the
 * environment already has rather than inventing a creative. A seeded ad with a
 * placeholder image would not be a meaningful test of an ad anyway — the point
 * is only to make the engagement surfaces reachable.
 */
const PARTNER_CONTENT: PartnerItem[] = [
  /**
   * Three separate Connect Brands items, because a Boost is recorded against
   * the item watched and the engine refuses the same one twice — three boosts
   * has to mean three different advertisements, not one watched three times.
   * Tier 1 needs all three (§11), so a single item caps everyone at tier 3.
   */
  {
    title: "Sponsor spot — Connect Brands",
    placement: "connect-brand-video",
    type: "video",
    condition: "Watch to the end to boost your entries",
    points: 10,
    why: "Earns Boosts (§7) and is what the reveal plays before an outcome.",
  },
  {
    title: "Sponsor spot — Connect Brands 2",
    placement: "connect-brand-video",
    type: "video",
    condition: "Watch to the end to boost your entries",
    points: 10,
    why: "Second distinct Boost item — three are needed for Tier 1.",
  },
  {
    title: "Sponsor spot — Connect Brands 3",
    placement: "connect-brand-video",
    type: "video",
    condition: "Watch to the end to boost your entries",
    points: 10,
    why: "Third distinct Boost item — three are needed for Tier 1.",
  },
  {
    title: "Sponsor offer — Lucky App Wall",
    placement: "lucky-app-wall",
    type: "app",
    condition: "Complete the offer to earn a Featured Offer",
    points: 50,
    why: "Earns Featured Offers (§8) once a partner confirms the conversion.",
  },
];

function assertSafeTarget(): void {
  const uri = process.env.DATABASE_URI ?? "";
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(uri);

  if (!(isLocal || process.env.NODE_ENV === "production")) {
    throw new Error(
      "Refusing to run against a non-local database without NODE_ENV=production.\n" +
        "Payload pushes its schema in any other mode, which would rewrite the " +
        "target environment's schema from your working copy."
    );
  }
}

async function main() {
  assertSafeTarget();

  const payload = await getPayload();
  const mode = WRITE ? "WRITE" : "DRY RUN — nothing will be created";
  console.log(`\n${mode}\n`);

  // --- Master Prize Catalogue -------------------------------------------

  const prizeIds = new Map<string, string>();

  for (const entry of CATALOGUE) {
    const existing = await payload.find({
      collection: "prize-catalogue",
      where: { name: { equals: entry.name } },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (existing.docs[0]) {
      prizeIds.set(entry.name, String(existing.docs[0].id));
      console.log(`  exists   prize      ${entry.name}`);
      continue;
    }

    if (!WRITE) {
      console.log(`  create   prize      ${entry.name} (${entry.tier})`);
      continue;
    }

    const created = await payload.create({
      collection: "prize-catalogue",
      data: { ...entry, active: true },
    });
    prizeIds.set(entry.name, String(created.id));
    console.log(`  created  prize      ${entry.name}`);
  }

  // --- Partner content --------------------------------------------------

  /**
   * Borrow the environment's existing partner and media rather than creating
   * them. Without both, the collection's own validation would refuse every
   * item, so say why and stop instead of failing item by item.
   */
  const [partners, media] = await Promise.all([
    payload.find({
      collection: "partners",
      limit: 1,
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: "media",
      limit: 1,
      pagination: false,
      depth: 0,
    }),
  ]);

  const partnerId = partners.docs[0]?.id;
  const mediaId = media.docs[0]?.id;

  if (!(partnerId && mediaId)) {
    console.log(
      `\n  skipped  content    needs an existing Partner (${partners.docs.length}) ` +
        `and Media (${media.docs.length}) record.\n` +
        "           Create one of each in the CMS, then re-run — an upload " +
        "cannot be seeded from here.\n"
    );
  }

  for (const item of partnerId && mediaId ? PARTNER_CONTENT : []) {
    const existing = await payload.find({
      collection: "partner-content",
      where: { title: { equals: item.title } },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (existing.docs[0]) {
      console.log(`  exists   content    ${item.title}`);
      continue;
    }

    if (!WRITE) {
      console.log(`  create   content    ${item.title} [${item.placement}]`);
      continue;
    }

    await payload.create({
      collection: "partner-content",
      data: {
        title: item.title,
        type: item.type,
        condition: item.condition,
        description: item.why,
        placements: [item.placement],
        points: item.points,
        partner: partnerId,
        media: mediaId,
        // Draft content is invisible to the app, which would leave the
        // surfaces exactly as empty as before.
        status: "active",
      },
    });
    console.log(`  created  content    ${item.title}`);
  }

  // --- An active giveaway, on request -----------------------------------

  if (WITH_GIVEAWAY) {
    const active = await payload.find({
      collection: "giveaways",
      where: { status: { equals: "active" } },
      limit: 1,
      pagination: false,
      depth: 0,
    });

    if (active.docs[0]) {
      console.log(
        `\n  exists   giveaway   "${active.docs[0].name}" is already active — skipping.`
      );
    } else if (WRITE) {
      const now = Date.now();
      const giveaway = await payload.create({
        collection: "giveaways",
        data: {
          name: `Seeded giveaway ${new Date().toISOString().slice(0, 10)}`,
          status: "active",
          startDate: new Date(now - 24 * 3_600_000).toISOString(),
          endDate: new Date(now + 7 * 24 * 3_600_000).toISOString(),
          ticketPrice: 50,
          minTicketsRequired: 1,
          /**
           * Left at the specification's defaults on purpose. A test giveaway
           * once ran with tier 3 at 100%, which awards a prize to every
           * eligible entrant — correct for proving the reveal with a single
           * participant, badly wrong anywhere else.
           */
          tier1WinnerPercentage: 0.1,
          tier2WinnerPercentage: 0.5,
          tier3WinnerPercentage: 5,
          budgetUtilizationPct: 100,
        },
      });

      for (const [name, prizeId] of prizeIds) {
        await payload.create({
          collection: "giveaway-prizes",
          data: {
            giveaway: giveaway.id,
            prize: prizeId,
            tier: "tier3",
            maxUnits: 5,
          },
        });
        console.log(`  created  pool       ${name} ×5`);
      }

      console.log(`\n  created  giveaway   ${giveaway.name}`);
    } else {
      console.log("\n  create   giveaway   with the seeded prizes at tier 3");
    }
  }

  if (!WRITE) {
    console.log("\nRe-run with --write to apply.\n");
  }

  /**
   * Tier 3 needs 20 participants before it can award anything: the cap is
   * `floor(participants × 5 / 100)`. Worth saying out loud, because a draw
   * that correctly awards nothing looks identical to one that is broken.
   */
  if (WITH_GIVEAWAY) {
    console.log(
      "\nNote: at the default 5%, tier 3 awards its first prize at 20 " +
        "participants. Below that the draw completes with no winners.\n"
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("\nSeed failed:", error);
  process.exit(1);
});
