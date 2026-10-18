"use client";

import { FieldLabel, useField, useFormFields } from "@payloadcms/ui";
import type { SelectFieldClientComponent } from "payload";
import { useEffect, useState } from "react";

const TIER_LABELS: Record<string, string> = {
  tier1: "Tier 1 – High Tier Prizes",
  tier2: "Tier 2 – Mid Tier Prizes",
  tier3: "Tier 3 – Low Tier Prizes",
};

/**
 * Read-only tier on a giveaway prize row.
 *
 * The tier is copied from the Master Prize Catalogue by a server hook when the
 * row is saved, so before saving the field sat on "Select a value" and looked
 * broken. This fills it in as soon as a prize is chosen. The server still
 * decides the stored value; this only shows it.
 */
export const PrizeTierField: SelectFieldClientComponent = ({ path, field }) => {
  const { value, setValue } = useField<string>({ path });
  const prizeField = useFormFields(([fields]) => fields.prize?.value);
  const prizeId =
    prizeField && typeof prizeField === "object" && "id" in prizeField
      ? String((prizeField as { id: unknown }).id)
      : (prizeField as string | undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!prizeId) {
      return;
    }

    let cancelled = false;

    fetch(`/api/prize-catalogue/${prizeId}?depth=0`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const prize = (await res.json()) as { tier?: string };
        if (!cancelled && prize.tier) {
          setFailed(false);
          setValue(prize.tier);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [prizeId, setValue]);

  let display = "Choose a prize first";
  if (value) {
    display = TIER_LABELS[value] ?? value;
  } else if (prizeId) {
    display = failed ? "Set from the catalogue when saved" : "Loading…";
  }

  return (
    <div className="field-type">
      <FieldLabel label={field.label} path={path} required={field.required} />
      <input
        className="field-type__input"
        disabled
        readOnly
        style={{ width: "100%", padding: "8px 12px" }}
        type="text"
        value={display}
      />
      <div className="field-description" style={{ marginTop: 8 }}>
        Inherited from the Master Prize Catalogue.
      </div>
    </div>
  );
};

export default PrizeTierField;
