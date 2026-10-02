"use client";

import { Button } from "@payloadcms/ui";
import { useState } from "react";

/**
 * Download registered users' names and emails as a CSV, optionally only those
 * who have not opened the app for a number of days. Shown above the Users list.
 *
 * The download is a plain navigation so the browser's own session cookie
 * authenticates it. The endpoint re-checks that the caller is an admin.
 */
export const ContactExport = () => {
  const [days, setDays] = useState("90");

  const download = () => {
    const n = Number.parseInt(days, 10);
    const query = Number.isFinite(n) && n > 0 ? `?inactiveDays=${n}` : "";
    window.location.href = `/api/users/export-contacts${query}`;
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        marginBottom: "1rem",
      }}
    >
      <label htmlFor="contact-export-days">
        Not opened the app for at least
      </label>
      <input
        id="contact-export-days"
        min={0}
        onChange={(event) => setDays(event.target.value)}
        style={{ width: "5rem" }}
        type="number"
        value={days}
      />
      <span>days (0 = everyone)</span>
      <Button buttonStyle="secondary" onClick={download} size="small">
        Export names &amp; emails (CSV)
      </Button>
    </div>
  );
};
