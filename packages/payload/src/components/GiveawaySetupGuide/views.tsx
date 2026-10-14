import type { DocumentViewServerProps } from "payload";
import type { ReactNode } from "react";

import { scopeOfRequest } from "../Analytics/access";
import { Denied, Panel, Styles } from "../Analytics/ui";

/**
 * The Setup Guide tab on a giveaway.
 *
 * The operators who configure giveaways kept shipping ones the draw had to
 * refuse — empty tier pools, a spend cap over prizes with no naira value —
 * even with a video walkthrough. A video lives somewhere else; this lives
 * beside the form, names the exact fields, and says what the Prize Pool
 * banner and the failure reasons mean in the same words the product uses.
 *
 * Static copy only: nothing here reads the giveaway, so there is nothing to
 * go stale and no permission beyond seeing the tab.
 */

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Panel title={`${n} — ${title}`}>
      <div style={{ display: "grid", gap: 8, fontSize: 13 }}>{children}</div>
    </Panel>
  );
}

function P({ children }: { children: ReactNode }): ReactNode {
  return <p style={{ margin: 0 }}>{children}</p>;
}

function Muted({ children }: { children: ReactNode }): ReactNode {
  return (
    <p className="ana-muted" style={{ margin: 0 }}>
      {children}
    </p>
  );
}

function Rows({ items }: { items: [string, string][] }): ReactNode {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map(([field, note]) => (
        <div key={field} style={{ display: "flex", gap: 10, fontSize: 13 }}>
          <code style={{ minWidth: 170 }}>{field}</code>
          <span>{note}</span>
        </div>
      ))}
    </div>
  );
}

/** The Setup Guide tab on a giveaway. Staff only, like the Stats tab. */
export async function GiveawaySetupGuideView(
  props: DocumentViewServerProps
): Promise<ReactNode> {
  const { req } = props.initPageResult;
  if (scopeOfRequest(req)?.kind !== "staff") {
    return <Denied />;
  }

  return (
    <>
      <Styles />
      <div className="ana ana-page">
        <div className="ana-head">
          <div>
            <h2>Giveaway Setup Guide</h2>
            <div className="ana-muted">
              Everything a giveaway needs before it goes Active, in the order to
              do it. A draw can only award what is configured here.
            </div>
          </div>
        </div>

        <Step n="Step 1" title="Put prizes in the Prize Catalogue first">
          <P>
            A giveaway cannot hold prizes directly — it borrows them from the{" "}
            <strong>Prize Catalogue</strong> (Giveaway group in the sidebar).
            Create each prize there before touching the giveaway.
          </P>
          <Rows
            items={[
              [
                "Tier",
                "High, Mid or Low — must match the tier you pool it under later.",
              ],
              [
                "Fulfilment type",
                "Airtime and Data pay out automatically. Points are credited. Physical, Gift Card and Experience are arranged by hand after the winner claims.",
              ],
              [
                "Value (₦)",
                "Optional. A prize with no value counts as ₦0 against a spend cap — it never blocks a draw. Fill it in for anything with a real retail price so cap reporting means something.",
              ],
            ]}
          />
        </Step>

        <Step n="Step 2" title="Create the giveaway as a Draft">
          <P>
            New giveaways start as <strong>Draft</strong>. Stay there until
            every step below is done — Draft is work in progress, and nothing
            about an unfinished draft is a failure.
          </P>
          <Rows
            items={[
              [
                "Start / End Date",
                "Ticket sales run between these. The draw happens automatically after the End Date.",
              ],
              ["Ticket Price", "Points charged per ticket."],
              [
                "Min Tickets Required",
                "Tickets a buyer must hold to count as a participant.",
              ],
              [
                "Description",
                "Shown on the giveaway screen. Keep it under 150 characters or phones cut it off.",
              ],
              [
                "Notification",
                "Separate section with its own title and body for the push sent when the giveaway goes Active. Both support {{firstName}} — see the box below. Left blank, the body falls back to the Description above, so nothing breaks for older giveaways.",
              ],
              [
                "Send push notification",
                "On by default, so users are told when a giveaway opens. Switch it off to activate quietly. Nothing is sent if both the notification body and the Description are empty.",
              ],
            ]}
          />
          <P>
            <strong>Using the user's name.</strong> Write{" "}
            <code>{"{{firstName}}"}</code> exactly like that, with the double
            curly brackets, in the notification title or body (or the
            Description the body falls back to). Each user sees their own first
            name in its place: typing{" "}
            <code>
              {"{{firstName}}, join 1500 winners to win amazing prizes"}
            </code>{" "}
            shows Segun "Segun, join 1500 winners to win amazing prizes". If we
            have no name for someone, a placeholder at the very start is simply
            dropped ("Join 1500 winners…") and one in the middle becomes "there"
            ("Hey there, …"), so nobody ever sees the curly brackets. The
            placeholder counts toward the 150 characters as typed, and real
            names are usually shorter than it.
          </P>
        </Step>

        <Step n="Step 3" title="Set the Winner Distribution">
          <P>
            Each tier&apos;s percentage is the maximum share of all participants
            who may win in that tier. Enter <strong>0 to disable</strong> a tier
            entirely — a disabled tier needs no prizes.
          </P>
          <P>
            Percentages round <strong>down</strong>: Tier 1 at 0.1% awards
            nobody until 1,000 people take part. For the defaults, the first
            winner becomes possible at:
          </P>
          <Rows
            items={[
              ["Tier 1 — 0.1%", "1,000 participants"],
              ["Tier 2 — 0.5%", "200 participants"],
              ["Tier 3 — 5%", "20 participants"],
            ]}
          />
          <P>Who can actually win each tier is fixed by the platform:</P>
          <Rows
            items={[
              [
                "Tier 1",
                "10 tickets + 3 Boosts + 1 Featured Offer — or a lower bar met across 4 giveaways in a row. Long-loyal players may also have the Featured Offer waived.",
              ],
              [
                "Tier 2",
                "4 tickets + 2 Boosts + 1 Featured Offer — or a lower bar met across 4 giveaways in a row.",
              ],
              ["Tier 3", "Any single valid ticket."],
            ]}
          />
          <Muted>
            One prize per person across the whole giveaway, and tiers draw
            top-down: a Tier 1 winner cannot also win Tier 2 or 3.
          </Muted>
        </Step>

        <Step n="Step 4" title="Build the prize pool">
          <P>
            Open <strong>Giveaway Prizes</strong> and add one row per prize:
            which catalogue prize, which tier it belongs to, and{" "}
            <strong>Maximum Units</strong> — how many of it this giveaway may
            award. The draw never awards more winners than units pooled, so a
            selected winner always has a prize behind them.
          </P>
          <Muted>
            Every tier left above 0% needs at least one pooled prize — unless
            the tier cannot award anyone yet (see the headcounts in Step 3), in
            which case the banner says so and the draw proceeds.
          </Muted>
        </Step>

        <Step n="Step 5" title="Budget Reserve — optional, skip if unsure">
          <P>
            Both settings are inert at their defaults; leave them alone unless
            you deliberately want to hold something back.
          </P>
          <Rows
            items={[
              [
                "Hard spend cap (₦)",
                "A ceiling, not a target — coming in under it is the normal case. Only priced prizes spend it; prizes with no Value (₦) count as ₦0 and never block the draw.",
              ],
              [
                "Maximum budget utilisation (%)",
                "The share of pooled units the draw may award. 100 means Maximum Units is the only ceiling; 85 holds 15% of the stock back for later giveaways.",
              ],
            ]}
          />
        </Step>

        <Step n="Step 6" title="Read the Prize Pool banner">
          <P>
            The banner at the top of the giveaway record is the draw&apos;s own
            verdict on your setup, recomputed live. Trust it over this guide.
          </P>
          <Rows
            items={[
              [
                "Green — covers",
                "Every enabled tier is stocked. Safe to activate.",
              ],
              [
                "Amber — thin or noted",
                "The draw will run, but something deserves a look: a pool thinner than the percentages could award, or a warning (unpriced prizes under a cap, an empty tier that cannot award anyone yet).",
              ],
              [
                "Red — cannot run yet",
                "The draw will refuse. Fix exactly what it names — usually an enabled tier with an empty pool that could award someone, or no prizes at all — then come back.",
              ],
            ]}
          />
        </Step>

        <Step n="Step 7" title="Activate">
          <P>
            Set Status to <strong>Active</strong>. Only one giveaway may be
            active at a time — if another holds the slot, the error names it;
            close that one out first. Once the End Date passes, the draw runs by
            itself within the hour: winners are picked, prizes allocated, and
            each winner gets 14 days to claim. Airtime and Data pay out on
            claim; everything else waits for you to arrange delivery.
          </P>
          <P>
            Activating also sends the push notification to every user (unless
            you switched <strong>Send push notification</strong> off). It goes
            out shortly after you save, each time the status changes to Active;
            editing a giveaway that is already Active does not send it again.
          </P>
        </Step>

        <Panel
          hint="Failed is a diagnosis, not a verdict: the reason is in the sidebar."
          title="If the status says Failed"
        >
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <P>
              Open the record and read <strong>Draw Error</strong> in the
              sidebar — it says exactly what refused the draw, in the same words
              as the red banner did.
            </P>
            <Rows
              items={[
                [
                  "“No prizes have been configured”",
                  "The pool is completely empty. Add Giveaway Prizes rows, set Status back to Active, and the next hourly run draws it.",
                ],
                [
                  "“Tier N is enabled but its Prize Pool is empty”",
                  "That tier could have awarded someone. Either pool a prize under it or set its percentage to 0, then set Status back to Active.",
                ],
              ]}
            />
            <P>
              A <strong>Failed</strong> giveaway stays editable precisely so it
              can be reopened this way. <strong>Interrupted</strong> is
              different: the draw started and stopped part-way, so only a Super
              Admin can authorize its resumption, and it continues from where it
              stopped rather than restarting.
            </P>
          </div>
        </Panel>
      </div>
    </>
  );
}
