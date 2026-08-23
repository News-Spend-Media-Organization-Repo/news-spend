"use client";

import { Button, toast, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { useState } from "react";

/**
 * Runs the draw for the lottery currently open in the admin.
 *
 * The button only offers itself once the lottery has actually ended and has not
 * been drawn, but it is not the security boundary. The endpoint re-checks the
 * role, the end date and the processed stamp, and the draw itself is idempotent.
 */
export const RunLotteryDraw: UIFieldClientComponent = () => {
  const { id, savedDocumentData } = useDocumentInfo();
  const [running, setRunning] = useState(false);

  // Read live form values so the button reacts before a save, falling back to
  // what is stored.
  const endDate = useFormFields(
    ([fields]) => fields.endDate?.value as string | undefined
  );
  const processedAt = useFormFields(
    ([fields]) => fields.processedAt?.value as string | undefined
  );

  const resolvedEnd =
    endDate ?? (savedDocumentData?.endDate as string | undefined);
  const resolvedProcessed =
    processedAt ?? (savedDocumentData?.processedAt as string | undefined);

  if (!id) {
    return (
      <p className="field-description">
        Save the lottery before a draw can be run.
      </p>
    );
  }

  if (resolvedProcessed) {
    return (
      <p className="field-description">
        Drawn on {new Date(resolvedProcessed).toLocaleString("en-GB")}. A draw
        cannot be run twice.
      </p>
    );
  }

  const hasEnded = resolvedEnd ? new Date() >= new Date(resolvedEnd) : false;

  if (!hasEnded) {
    return (
      <p className="field-description">
        The draw becomes available after the end date
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
      const res = await fetch(`/api/lottery/${id}/run-draw`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const body = (await res.json()) as { message?: string };

      if (res.ok) {
        toast.success(body.message ?? "Draw complete.");
        // Winners, processedAt and isActive all changed server-side.
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
        {running ? "Running draw…" : "Run draw now"}
      </Button>
      <p className="field-description">
        Selects winners and notifies them. This cannot be undone, and the draw
        can only run once.
      </p>
    </div>
  );
};

export default RunLotteryDraw;
