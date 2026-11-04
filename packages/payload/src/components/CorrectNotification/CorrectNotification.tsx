"use client";

import { Button, toast, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { useState } from "react";

/**
 * Re-send a campaign that has already gone out.
 *
 * The push itself cannot be recalled, so this sends the saved copy again to
 * the devices the campaign reached. The notification id doubles as the OS
 * collapse id/tag, so devices still showing the original replace it instead of
 * stacking a duplicate. The endpoint re-checks the role.
 */
export const CorrectNotification: UIFieldClientComponent = () => {
  const { id, savedDocumentData } = useDocumentInfo();
  const [sending, setSending] = useState(false);

  const sentAt = useFormFields(
    ([fields]) => fields.sentAt?.value as string | undefined
  );
  const resolvedSentAt =
    sentAt ?? (savedDocumentData?.sentAt as string | undefined);

  if (!(id && resolvedSentAt)) {
    return (
      <p className="field-description">
        Correction is available once the notification has been sent.
      </p>
    );
  }

  const correct = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/notifications/${id}/correct`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const body = (await res.json()) as { message?: string };

      if (res.ok) {
        toast.success(body.message ?? "Correction sent.");
        return;
      }

      toast.error(body.message ?? `Could not correct (${res.status}).`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reach the server."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="field-type">
      <Button
        buttonStyle="secondary"
        disabled={sending}
        onClick={correct}
        size="medium"
      >
        {sending ? "Sending…" : "Correct this notification"}
      </Button>
      <p className="field-description">
        Save your changes first: this re-sends the saved title and body to the
        devices that received this campaign. Devices still showing the original
        replace it; inbox copies are updated in place.
      </p>
    </div>
  );
};

export default CorrectNotification;
