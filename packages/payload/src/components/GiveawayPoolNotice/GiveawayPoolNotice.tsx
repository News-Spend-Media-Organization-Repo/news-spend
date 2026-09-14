"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
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
 * a fetch failure hides the notice rather than blocking the form.
 */
export const GiveawayPoolNotice: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo();
  const status = useFormFields(
    ([fields]) => fields.status?.value as string | undefined
  );

  const [notice, setNotice] = useState<PoolNotice | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    fetch(`/api/giveaways/${id}/pool-notice`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          return;
        }
        const body = (await res.json()) as PoolNotice;
        if (!cancelled) {
          setNotice(body);
        }
      })
      .catch(() => {
        // Intentionally hidden: the notice is advisory, never blocking.
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id || status === "completed" || status === "cancelled" || !notice) {
    return null;
  }

  if (notice.errors.length > 0) {
    return (
      <div
        style={{
          background: "#fdecea",
          border: "1px solid #f5c6cb",
          borderRadius: 4,
          padding: "12px 16px",
        }}
      >
        <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
          This draw cannot run yet ({notice.participants} participant
          {notice.participants === 1 ? "" : "s"} so far):
        </p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {notice.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (notice.warnings.length > 0) {
    return (
      <div
        style={{
          background: "#fff8e1",
          border: "1px solid #ffe082",
          borderRadius: 4,
          padding: "12px 16px",
        }}
      >
        <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
          Prize pool looks thin ({notice.participants} participant
          {notice.participants === 1 ? "" : "s"} so far):
        </p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {notice.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <p className="field-description">
      Prize pool covers {notice.participants} participant
      {notice.participants === 1 ? "" : "s"}:{" "}
      {notice.tiers
        .map((tier) => `${tier.tier} × ${tier.effectiveCap}`)
        .join(", ")}
      .
    </p>
  );
};

export default GiveawayPoolNotice;
