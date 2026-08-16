"use client";

import { Button, toast, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { useState } from "react";

/**
 * Runs — or resumes — the draw for the giveaway open in the admin.
 *
 * Two reasons this exists rather than leaving everything to the hourly sweep.
 * A draw that needs running early, or re-running after a failure, otherwise has
 * no control at all; and more seriously, the sweep only ever selects giveaways
 * whose status is `active`, so a draw an administrator has authorized to resume
 * (§19) is picked up by nothing. This is its only execution path.
 *
 * The states below are a courtesy, not a security boundary or the rule set. The
 * endpoint re-checks the role and hands the whole decision to the engine's own
 * validation, so anything this component gets wrong is still refused server-side
 * with the engine's own words.
 */
export const RunGiveawayDraw: UIFieldClientComponent = () => {
  const { id, savedDocumentData } = useDocumentInfo();
  const [running, setRunning] = useState(false);

  // Read live form values so the button reacts before a save, falling back to
  // what is stored.
  const status = useFormFields(
    ([fields]) => fields.status?.value as string | undefined
  );
  const endDate = useFormFields(
    ([fields]) => fields.endDate?.value as string | undefined
  );

  const resolvedStatus =
    status ?? (savedDocumentData?.status as string | undefined);
  const resolvedEnd =
    endDate ?? (savedDocumentData?.endDate as string | undefined);
  const drawCompletedAt = savedDocumentData?.drawCompletedAt as
    | string
    | undefined;

  if (!id) {
    return (
      <p className="field-description">
        Save the giveaway before a draw can be run.
      </p>
    );
  }

  if (resolvedStatus === "completed") {
    return (
      <p className="field-description">
        Drawn
        {drawCompletedAt
          ? ` on ${new Date(drawCompletedAt).toLocaleString("en-GB")}`
          : ""}
        . A completed draw cannot be repeated.
      </p>
    );
  }

  if (resolvedStatus === "cancelled") {
    return (
      <p className="field-description">
        This giveaway was cancelled and cannot be drawn.
      </p>
    );
  }

  if (
    resolvedStatus &&
    ["ready", "pool_building", "pool_locked", "draw_in_progress"].includes(
      resolvedStatus
    )
  ) {
    return (
      <p className="field-description">
        A draw is already in progress ({resolvedStatus}). Wait for it to finish
        or be interrupted.
      </p>
    );
  }

  /**
   * §19 — a stopped draw is not restartable, only resumable, and only once an
   * administrator has authorized it. Offering a button here would invite
   * exactly the restart the specification forbids, because a restart would
   * re-draw tiers that already have winners.
   */
  if (resolvedStatus && ["interrupted", "failed"].includes(resolvedStatus)) {
    return (
      <p className="field-description">
        This draw stopped part-way through ({resolvedStatus}). Set the status to
        “Resumption Authorized” to continue it from its last checkpoint — it
        cannot be restarted, or the tiers already drawn would be drawn again.
      </p>
    );
  }

  const isResumption = resolvedStatus === "resumption_authorized";

  if (!isResumption && resolvedStatus !== "active") {
    return (
      <p className="field-description">
        Only an active giveaway can be drawn (this one is “{resolvedStatus}”).
      </p>
    );
  }

  // A resumption continues a draw whose countdown ended long ago, so the end
  // date is only a gate on starting a fresh one.
  const hasEnded = resolvedEnd ? new Date() >= new Date(resolvedEnd) : false;

  if (!(isResumption || hasEnded)) {
    return (
      <p className="field-description">
        The draw becomes available after the countdown ends
        {resolvedEnd
          ? ` (${new Date(resolvedEnd).toLocaleString("en-GB")})`
          : ""}
        .
      </p>
    );
  }

  const runDraw = async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/giveaways/${id}/run-draw`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: isResumption }),
      });

      const body = (await res.json()) as { message?: string };

      if (res.ok) {
        toast.success(body.message ?? "Draw complete.");
        // Status, winners and the checkpoint all changed server-side.
        window.location.reload();
        return;
      }

      toast.error(body.message ?? `Draw failed (${res.status}).`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reach the server."
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="field-type">
      <Button
        buttonStyle="primary"
        disabled={running}
        onClick={runDraw}
        size="medium"
      >
        {running
          ? isResumption
            ? "Resuming draw…"
            : "Running draw…"
          : isResumption
            ? "Resume draw from last checkpoint"
            : "Run draw now"}
      </Button>
      <p className="field-description">
        {isResumption
          ? "Continues this draw from its last checkpoint, reusing the recorded seed so the tiers already drawn keep their winners."
          : "Locks the candidate pool, selects winners and allocates prizes. This cannot be undone."}
      </p>
    </div>
  );
};

export default RunGiveawayDraw;
