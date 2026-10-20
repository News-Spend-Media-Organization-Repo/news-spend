"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";

import { shouldShowMarker, subscribeLastSeen } from "./marker";

const DOT: CSSProperties = {
  display: "inline-block",
  width: 6,
  height: 6,
  marginLeft: 6,
  borderRadius: "50%",
  background: "#D9A23B",
};

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** The dot and its text alternative, shown or not. */
export function MarkerContent({ show }: { show: boolean }): ReactNode {
  if (!show) {
    return null;
  }

  return (
    <>
      <span aria-hidden="true" className="wn-dot" style={DOT} />
      <span style={VISUALLY_HIDDEN}>(new entries)</span>
    </>
  );
}

/**
 * A dot beside the What's new link when the newest entry has not been opened.
 *
 * Rendered after mount only, so the server HTML and the first browser render
 * agree whether storage is available or not. It re-checks when the page
 * records a visit in this tab, and when another tab writes the same key.
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
    const update = () => setShow(shouldShowMarker(newestDate, userId));
    update();
    return subscribeLastSeen(update);
  }, [newestDate, userId]);

  return <MarkerContent show={show} />;
}
