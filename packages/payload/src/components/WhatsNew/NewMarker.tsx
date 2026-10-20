"use client";

import { useEffect, useState } from "react";

import { isNewestUnread, readLastSeen } from "./marker";

/**
 * A dot beside the What's new link when the newest entry has not been opened.
 *
 * Rendered after mount only, so the server HTML and the first browser render
 * agree whether storage is available or not.
 */
export function NewMarker({
  userId,
  newestDate,
}: {
  userId: string;
  newestDate: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isNewestUnread(newestDate, readLastSeen(userId)));
  }, [newestDate, userId]);

  if (!show) {
    return null;
  }

  return (
    <span
      aria-label="New entries"
      className="wn-dot"
      role="status"
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        marginLeft: 6,
        borderRadius: "50%",
        background: "#D9A23B",
      }}
    />
  );
}
