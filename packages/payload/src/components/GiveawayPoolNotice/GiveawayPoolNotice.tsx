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

type PoolNotice = {
  participants: number;
  errors: string[];
  warnings: string[];
  tiers: PoolTier[];
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
    </Banner>
  );
};

export default GiveawayPoolNotice;
