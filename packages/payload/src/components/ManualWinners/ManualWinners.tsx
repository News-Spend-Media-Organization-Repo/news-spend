"use client";

import { Button, toast, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { useEffect, useMemo, useState } from "react";
import { MANUAL_WINNER_REASON_MAX_LENGTH } from "../../collections/giveaway/constants";

type Candidate = {
  userKey: string;
  name: string | null;
  email: string | null;
  validTickets: number;
  boosts: number;
  featuredOffers: number;
  qualifiesFor: string[];
  heldForReview: boolean;
};

type Prize = {
  id: string;
  prizeName: string;
  tier: string;
  unitsRemaining: number;
};

type Listing = {
  participants: Candidate[];
  total: number;
  page: number;
  limit: number;
  prizes: Prize[];
};

type Pick = {
  userKey: string;
  who: string;
  prizeRowId: string;
  prizeLabel: string;
  reason: string;
};

type Draft = { prizeRowId: string; reason: string };

const SEARCH_DEBOUNCE_MS = 300;

const TIER_LABELS: Record<string, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  tier3: "Tier 3",
};

const displayName = (c: Candidate) => c.name ?? c.email ?? c.userKey;

/**
 * Seat chosen participants as winners, in addition to the draw (before it
 * runs, or after it completes).
 *
 * Like `RunGiveawayDraw`, the states here are a courtesy. The endpoint checks
 * the role and the engine checks every rule (ticket, stock, one win per
 * person, account flags), so whatever this gets wrong is refused server-side
 * in the engine's own words, which are shown verbatim.
 *
 * Picks are posted one at a time rather than as a batch, so one bad row is
 * reported on its own and the rest still land.
 */
export const ManualWinners: UIFieldClientComponent = () => {
  const { id, savedDocumentData } = useDocumentInfo();
  const status =
    useFormFields(([fields]) => fields.status?.value as string | undefined) ??
    (savedDocumentData?.status as string | undefined);
  const open = status === "active" || status === "completed";

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [picks, setPicks] = useState<Pick[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!(id && open)) {
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (query) {
      params.set("search", query);
    }

    const load = async () => {
      try {
        const res = await fetch(
          `/api/giveaways/${id}/participants?${params.toString()}`,
          { credentials: "include", signal: controller.signal }
        );
        const body = (await res.json()) as Listing & { message?: string };
        if (!res.ok) {
          setLoadError(body.message ?? `Request failed (${res.status}).`);
          return;
        }
        setLoadError(null);
        setListing(body);
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not reach the server."
          );
        }
      }
    };

    load();
    return () => controller.abort();
  }, [id, open, page, query]);

  /** Units still free once the picks waiting to be confirmed are counted. */
  const unitsLeft = useMemo(() => {
    const left = new Map<string, number>();
    for (const prize of listing?.prizes ?? []) {
      left.set(prize.id, prize.unitsRemaining);
    }
    for (const pick of picks) {
      left.set(pick.prizeRowId, (left.get(pick.prizeRowId) ?? 0) - 1);
    }
    return left;
  }, [listing, picks]);

  if (!id) {
    return (
      <p className="field-description">
        Save the giveaway before adding manual winners.
      </p>
    );
  }

  if (!open) {
    return (
      <p className="field-description">
        Manual winners can only be added before the draw (Active) or after it
        has completed. This giveaway is “{status ?? "unknown"}”.
      </p>
    );
  }

  const prizes = listing?.prizes ?? [];
  const prizeLabel = (prize: Prize) =>
    `${prize.prizeName} · ${TIER_LABELS[prize.tier] ?? prize.tier}`;

  const draftFor = (userKey: string): Draft =>
    drafts[userKey] ?? { prizeRowId: "", reason: "" };

  const setDraft = (userKey: string, change: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [userKey]: { ...draftFor(userKey), ...change },
    }));

  const addPick = (candidate: Candidate) => {
    const draft = draftFor(candidate.userKey);
    const prize = prizes.find((p) => p.id === draft.prizeRowId);
    if (!prize) {
      return;
    }
    setPicks((current) => [
      ...current,
      {
        userKey: candidate.userKey,
        who: displayName(candidate),
        prizeRowId: prize.id,
        prizeLabel: prizeLabel(prize),
        reason: draft.reason.trim(),
      },
    ]);
  };

  const removePick = (userKey: string) =>
    setPicks((current) => current.filter((p) => p.userKey !== userKey));

  const confirm = async () => {
    setConfirming(true);
    setFailures([]);
    const failed: string[] = [];
    const failedKeys = new Set<string>();
    let added = 0;

    // In order, one at a time: a retried or doubled request for the same
    // person is refused by the engine, but two in flight at once are not.
    for (const pick of picks) {
      try {
        const res = await fetch(`/api/giveaways/${id}/manual-winner`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userKey: pick.userKey,
            prizeRowId: pick.prizeRowId,
            reason: pick.reason || undefined,
          }),
        });
        const body = (await res.json()) as { message?: string };
        if (res.ok) {
          added += 1;
        } else {
          failedKeys.add(pick.userKey);
          failed.push(
            `${pick.who}: ${body.message ?? `Request failed (${res.status}).`}`
          );
        }
      } catch (error) {
        failedKeys.add(pick.userKey);
        failed.push(
          `${pick.who}: ${error instanceof Error ? error.message : "Could not reach the server."}`
        );
      }
    }

    setConfirming(false);

    if (failed.length > 0) {
      setFailures(failed);
      // Keep only the picks that did not land, so they can be fixed or dropped.
      setPicks((current) => current.filter((p) => failedKeys.has(p.userKey)));
      toast.error(
        `${added} added, ${failed.length} refused. See the list below.`
      );
      return;
    }

    toast.success(`${added} winner${added === 1 ? "" : "s"} added.`);
    window.location.reload();
  };

  const pickedKeys = new Set(picks.map((p) => p.userKey));
  const total = listing?.total ?? 0;
  const limit = listing?.limit ?? 25;
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="field-type">
      <p className="field-description">
        {status === "active"
          ? "Seat people as winners before the draw. They keep their prize, the draw skips them, and their units come out of the pool it draws from."
          : "Add winners to this completed draw. They get the normal claim window and fulfilment."}{" "}
        Tier thresholds, winner percentages and fairness cooldowns do not apply
        to a manual pick. Each one is recorded against your account.
      </p>

      {status === "completed" && (
        <p className="field-description">
          The Winner Report has already been sent. Resend it from Winner Report
          below after adding winners.
        </p>
      )}

      <input
        aria-label="Search participants by name or email"
        className="field-type__input"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name or email"
        style={{ width: "100%", padding: "8px 12px", marginTop: 8 }}
        type="search"
        value={search}
      />

      {loadError && (
        <div className="field-error" style={{ marginTop: 8 }}>
          {loadError}
        </div>
      )}

      {listing && listing.participants.length === 0 && (
        <p className="field-description" style={{ marginTop: 8 }}>
          {query
            ? "Nobody who can still be picked matches that search."
            : "No participants can be picked: everyone holding a valid ticket is already a winner or excluded."}
        </p>
      )}

      {listing && listing.participants.length > 0 && (
        <table style={{ width: "100%", marginTop: 12, borderSpacing: 0 }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Participant</th>
              <th>Tickets · Boosts · Offers</th>
              <th>Prize</th>
              <th>Reason (optional)</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {listing.participants.map((candidate) => {
              const draft = draftFor(candidate.userKey);
              const picked = pickedKeys.has(candidate.userKey);
              return (
                <tr key={candidate.userKey}>
                  <td style={{ padding: "6px 8px 6px 0" }}>
                    <div>{displayName(candidate)}</div>
                    {candidate.email && candidate.name && (
                      <div className="field-description">{candidate.email}</div>
                    )}
                    {candidate.heldForReview && (
                      <div className="field-description">
                        Flagged: the prize will be held for review.
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {candidate.validTickets} · {candidate.boosts} ·{" "}
                    {candidate.featuredOffers}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <select
                      aria-label={`Prize for ${displayName(candidate)}`}
                      className="field-type__input"
                      disabled={picked}
                      onChange={(event) =>
                        setDraft(candidate.userKey, {
                          prizeRowId: event.target.value,
                        })
                      }
                      style={{ width: "100%", padding: "6px 8px" }}
                      value={draft.prizeRowId}
                    >
                      <option value="">Choose a prize</option>
                      {prizes.map((prize) => {
                        const left = unitsLeft.get(prize.id) ?? 0;
                        return (
                          <option
                            disabled={left <= 0}
                            key={prize.id}
                            value={prize.id}
                          >
                            {prizeLabel(prize)} · {Math.max(0, left)} left
                          </option>
                        );
                      })}
                    </select>
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <input
                      aria-label={`Reason for ${displayName(candidate)}`}
                      className="field-type__input"
                      disabled={picked}
                      maxLength={MANUAL_WINNER_REASON_MAX_LENGTH}
                      onChange={(event) =>
                        setDraft(candidate.userKey, {
                          reason: event.target.value,
                        })
                      }
                      style={{ width: "100%", padding: "6px 8px" }}
                      value={draft.reason}
                    />
                  </td>
                  <td style={{ padding: "6px 0 6px 8px" }}>
                    <Button
                      buttonStyle="secondary"
                      disabled={
                        picked ||
                        !draft.prizeRowId ||
                        (unitsLeft.get(draft.prizeRowId) ?? 0) <= 0
                      }
                      onClick={() => addPick(candidate)}
                      size="small"
                    >
                      {picked ? "Added" : "Add to list"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {total > limit && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <Button
            buttonStyle="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            size="small"
          >
            Previous
          </Button>
          <span className="field-description">
            Page {page} of {lastPage} · {total} people
          </span>
          <Button
            buttonStyle="secondary"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
            size="small"
          >
            Next
          </Button>
        </div>
      )}

      {picks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="field-description">To be added:</p>
          <ul style={{ paddingLeft: 18 }}>
            {picks.map((pick) => (
              <li key={pick.userKey} style={{ marginBottom: 4 }}>
                {pick.who}: {pick.prizeLabel}
                {pick.reason ? ` (${pick.reason})` : ""}{" "}
                <Button
                  buttonStyle="none"
                  disabled={confirming}
                  onClick={() => removePick(pick.userKey)}
                  size="small"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <Button
            buttonStyle="primary"
            disabled={confirming}
            onClick={confirm}
            size="medium"
          >
            {confirming
              ? "Adding…"
              : `Confirm ${picks.length} winner${picks.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}

      {failures.length > 0 && (
        <div className="field-error" style={{ marginTop: 8 }}>
          <ul style={{ paddingLeft: 18 }}>
            {failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ManualWinners;
