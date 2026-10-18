"use client";

import { Banner, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { useEffect, useState } from "react";

type PoolTier = {
  tier: string;
  winnerPercentage: number;
  effectiveCap: number;
  maxByPercentage: number;
  unitsAvailable: number;
};

type TierBreakdown = {
  tier: string;
  winnerPercentage: number | null;
  prizes: number;
  units: number;
};

type PoolNotice = {
  participants: number;
  breakdown?: TierBreakdown[];
  errors: string[];
  warnings: string[];
  tiers: PoolTier[];
};

const FIX_HINTS: { match: string; fix: string }[] = [
  {
    match: "no prize is assigned to",
    fix: "An enabled tier needs at least one prize of that tier. A prize's tier comes from the Master Prize Catalogue, so add a catalogue prize that belongs to that tier (Maximum Units of 1 or more), or set the tier's percentage to 0 under Winner Distribution to switch it off.",
  },
  {
    match: "No prizes have been configured",
    fix: "Add at least one row under Giveaway Prizes for this giveaway, choosing its tier and Maximum Units.",
  },
  {
    match: "does not have a valid Maximum Units",
    fix: "Open that Giveaway Prizes row and set Maximum Units to a whole number of 1 or more.",
  },
  {
    match: "Winner Distribution is not configured",
    fix: "Fill in the percentage for that tier under Winner Distribution. Enter 0 to disable the tier.",
  },
  {
    match: "monetary budget cap",
    fix: "Optional: give the listed prizes a Value (₦) so the cap applies to them, or clear Hard spend cap (₦). The draw is not blocked.",
  },
];

/** Plain-language next step for each known setup problem. */
const FixHints = ({ messages }: { messages: string[] }) => {
  const fixes = FIX_HINTS.filter(({ match }) =>
    messages.some((message) => message.includes(match))
  );
  if (fixes.length === 0) {
    return null;
  }
  return (
    <div style={{ marginTop: 8 }}>
      <strong>How to fix:</strong>
      <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
        {fixes.map(({ match, fix }) => (
          <li key={match}>{fix}</li>
        ))}
      </ul>
    </div>
  );
};

/** One line per tier: percentage against what is stocked under it. */
const TierBreakdownList = ({ breakdown }: { breakdown?: TierBreakdown[] }) => {
  if (!breakdown?.length) {
    return null;
  }
  return (
    <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
      {breakdown.map(({ tier, winnerPercentage, prizes, units }) => (
        <li key={tier}>
          <strong>{tier}</strong>{" "}
          {winnerPercentage ? `(${winnerPercentage}%)` : "(off)"}:{" "}
          {prizes === 0
            ? "no prizes"
            : `${prizes} prize${prizes === 1 ? "" : "s"}, ${units} unit${units === 1 ? "" : "s"}`}
        </li>
      ))}
    </ul>
  );
};

/**
 * Prize-pool notice on the giveaway edit screen.
 *
 * Shows what would refuse the draw (no prizes, an enabled tier with an empty
 * pool, bad unit counts) and what would merely thin it (fewer pooled units
 * than the percentages could award at the current headcount). Advisory only:
 * a fetch failure shows a soft error rather than blocking the form.
 */
export const GiveawayPoolNotice: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo();
  const status = useFormFields(
    ([fields]) => fields.status?.value as string | undefined
  );

  const [notice, setNotice] = useState<PoolNotice | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    fetch(`/api/giveaways/${id}/pool-notice`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as PoolNotice;
        if (!cancelled) {
          setNotice(body);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetchError(
            err instanceof Error
              ? err.message
              : "Could not load prize pool info"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Still loading or hidden states
  if (!id || status === "completed" || status === "cancelled") {
    return null;
  }

  // Fetch failed — show a soft error banner
  if (fetchError) {
    return (
      <Banner type="info">Prize pool info unavailable: {fetchError}</Banner>
    );
  }

  // Still loading
  if (!notice) {
    return null;
  }

  if (notice.errors.length > 0) {
    return (
      <Banner type="error">
        <strong>
          This draw cannot run yet ({notice.participants} participant
          {notice.participants === 1 ? "" : "s"} so far):
        </strong>{" "}
        {notice.errors.join(" ")}
        <FixHints messages={notice.errors} />
        <TierBreakdownList breakdown={notice.breakdown} />
      </Banner>
    );
  }

  if (notice.warnings.length > 0) {
    return (
      <Banner type="info">
        <strong>
          Prize pool looks thin ({notice.participants} participant
          {notice.participants === 1 ? "" : "s"} so far):
        </strong>{" "}
        {notice.warnings.join(" ")}
        <FixHints messages={notice.warnings} />
        <TierBreakdownList breakdown={notice.breakdown} />
      </Banner>
    );
  }

  return (
    <Banner type="success">
      Prize pool covers {notice.participants} participant
      {notice.participants === 1 ? "" : "s"}:{" "}
      {notice.tiers
        .map((tier) => `${tier.tier} × ${tier.effectiveCap}`)
        .join(", ")}
      .
      <TierBreakdownList breakdown={notice.breakdown} />
    </Banner>
  );
};

export default GiveawayPoolNotice;
