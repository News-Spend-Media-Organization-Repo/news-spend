"use client";

import {
  FieldLabel,
  ReactSelect,
  type ReactSelectOption,
  useField,
} from "@payloadcms/ui";
import type { RelationshipFieldClientComponent } from "payload";
import { useEffect, useState } from "react";

type CataloguePrize = {
  id: string;
  name: string;
  tier: string;
  active?: boolean | null;
};

const TIER_NUMBER: Record<string, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  tier3: "Tier 3",
};

const tierLabel = (tier: string) => TIER_NUMBER[tier] ?? tier;

/**
 * Prize picker for a giveaway prize row.
 *
 * The stock relationship dropdown labels each prize by name alone, so the tier
 * a prize will land in is invisible until the row is saved. This labels every
 * option "Name – Tier N" and sorts by tier, so the admin picks with the tier in
 * view. It uses Payload's own searchable select, so typing filters the list. The stored value is still the catalogue prize id.
 */
export const PrizeSelectField: RelationshipFieldClientComponent = ({
  path,
  field,
}) => {
  const { value, setValue, showError, errorMessage } = useField<string>({
    path,
  });
  const [prizes, setPrizes] = useState<CataloguePrize[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/prize-catalogue?limit=0&depth=0&sort=tier", {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as { docs: CataloguePrize[] };
        if (!cancelled) {
          setPrizes(body.docs);
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
  }, []);

  const selectable = (prizes ?? [])
    .filter((prize) => prize.active !== false || prize.id === value)
    .sort(
      (a, b) =>
        a.tier.localeCompare(b.tier) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

  const options: ReactSelectOption<string>[] = selectable.map((prize) => ({
    label: `${prize.name} – ${tierLabel(prize.tier)}`,
    value: prize.id,
  }));

  return (
    <div className="field-type">
      <FieldLabel label={field.label} path={path} required={field.required} />
      <ReactSelect
        disabled={prizes === null && !failed}
        isClearable
        isSearchable
        onChange={(option) => {
          const picked = Array.isArray(option) ? option[0] : option;
          setValue(picked ? String(picked.value) : null);
        }}
        options={options}
        placeholder={
          prizes === null && !failed ? "Loading prizes…" : "Select a prize"
        }
        value={options.find((option) => option.value === value)}
      />
      {failed && (
        <div className="field-error" style={{ marginTop: 8 }}>
          Could not load the prize catalogue. Reload the page and try again.
        </div>
      )}
      {showError && errorMessage && (
        <div className="field-error" style={{ marginTop: 8 }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default PrizeSelectField;
