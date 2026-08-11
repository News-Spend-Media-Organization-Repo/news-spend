/**
 * Report the draw state of every lottery that has ended, and optionally run a
 * draw for one of them.
 *
 * Written for recovering a round whose scheduled draw never ran. It reports by
 * default and only writes when told to, because the risk here is not failing to
 * draw — it is drawing twice. `LotteryEngine` writes one winner row per ticket
 * with no existence check, so a round that was *partially* drawn will gain a
 * second overlapping set of winners if it is simply re-run.
 *
 * Usage, from apps/cms:
 *
 *   bun run src/scripts/inspect-lottery-draw.ts
 *       Report only. Touches nothing.
 *
 *   bun run src/scripts/inspect-lottery-draw.ts --draw <lotteryId>
 *       Run the draw for one lottery, but only if this script judges it safe.
 *
 *   bun run src/scripts/inspect-lottery-draw.ts --draw <lotteryId> --force
 *       Draw even though winners already exist. Creates duplicates. Only for a
 *       round whose partial winners have already been cleared by hand.
 */

import { getPayload } from "@news-spend-media/payload";
import { LotteryEngine } from "@news-spend-media/payload/lib/lottery/LotteryEngine";
import { sendLotteryNotification } from "@news-spend-media/payload/lib/lottery-notification";

type DrawState = "not-drawn" | "partial" | "complete" | "stamped";

const args = process.argv.slice(2);
const drawIndex = args.indexOf("--draw");
const targetId = drawIndex === -1 ? null : args[drawIndex + 1];
const force = args.includes("--force");

const payload = await getPayload();

const ended = await payload.find({
  collection: "lottery",
  where: { endDate: { less_than: new Date().toISOString() } },
  sort: "-endDate",
  pagination: false,
  depth: 0,
});

if (ended.docs.length === 0) {
  console.log("No lotteries have ended yet.");
  process.exit(0);
}

const rows: {
  id: string;
  name: string;
  ended: string;
  ticketRows: number;
  uniqueUsers: number;
  winners: number;
  state: DrawState;
  isActive: boolean;
  processing: boolean;
}[] = [];

for (const lottery of ended.docs) {
  const [tickets, winners] = await Promise.all([
    payload.find({
      collection: "lottery-tickets",
      where: { lottery: { equals: lottery.id } },
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: "lottery-winners",
      where: { lottery: { equals: lottery.id } },
      pagination: false,
      depth: 0,
    }),
  ]);

  const uniqueUsers = new Set(
    tickets.docs.map((t) =>
      typeof t.user === "object" && t.user ? t.user.id : t.user
    )
  ).size;

  // The legacy engine writes one winner per ticket row, so a finished draw has
  // as many winners as ticket rows. Fewer means it stopped partway.
  let state: DrawState;
  if (lottery.processedAt) {
    state = "stamped";
  } else if (winners.totalDocs === 0) {
    state = "not-drawn";
  } else if (winners.totalDocs >= tickets.totalDocs) {
    state = "complete";
  } else {
    state = "partial";
  }

  rows.push({
    id: lottery.id,
    name: lottery.name,
    ended: new Date(lottery.endDate).toLocaleString("en-GB"),
    ticketRows: tickets.totalDocs,
    uniqueUsers,
    winners: winners.totalDocs,
    state,
    isActive: Boolean(lottery.isActive),
    processing: Boolean(lottery.processing),
  });
}

console.log("\nEnded lotteries\n");
for (const r of rows) {
  console.log(`  ${r.name}  (${r.id})`);
  console.log(`    ended        ${r.ended}`);
  console.log(`    tickets      ${r.ticketRows} rows / ${r.uniqueUsers} users`);
  console.log(`    winners      ${r.winners}`);
  console.log(
    `    flags        isActive=${r.isActive} processing=${r.processing}`
  );
  console.log(`    state        ${describe(r.state)}\n`);
}

function describe(state: DrawState): string {
  switch (state) {
    case "stamped":
      return "drawn (processedAt set) — nothing to do";
    case "not-drawn":
      return "NOT DRAWN — safe to draw";
    case "complete":
      return "winners exist for every ticket, but processedAt is unset — the draw finished and the stamp did not land. Do NOT re-draw; stamp it instead.";
    case "partial":
      return "PARTIAL — some winners written, some missing. Re-drawing will duplicate the existing ones. Clear them first.";
    default:
      return state;
  }
}

if (!targetId) {
  console.log(
    "Report only. Pass --draw <lotteryId> to run a draw for one of these.\n"
  );
  process.exit(0);
}

const target = rows.find((r) => r.id === targetId);

if (!target) {
  console.error(`\nLottery ${targetId} is not in the ended list above.\n`);
  process.exit(1);
}

if (target.state !== "not-drawn" && !force) {
  console.error(
    `\nRefusing to draw "${target.name}": ${describe(target.state)}\n` +
      "Pass --force only once you have dealt with the existing winners.\n"
  );
  process.exit(1);
}

console.log(
  `\nDrawing "${target.name}" (${target.ticketRows} ticket rows)...${force ? " [FORCED]" : ""}\n`
);

const engine = new LotteryEngine(payload);
const result = await engine.runLottery(target.id);

if ("alreadyProcessed" in result && result.alreadyProcessed) {
  console.log(
    "The engine refused: this draw is already running or already processed.\n"
  );
  process.exit(0);
}

console.log(
  `Draw complete — ${result.totalWinners ?? 0} winners from ${result.totalParticipants ?? 0} participants.`
);

await sendLotteryNotification({ lotteryId: target.id, payload });
console.log("Winner notifications sent.\n");

process.exit(0);
