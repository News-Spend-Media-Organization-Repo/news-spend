"use client";

import { useEffect } from "react";

import { writeLastSeen } from "./marker";

/** Records that this member has opened the page and seen its newest entry. */
export function RecordVisit({
  userId,
  newestDate,
}: {
  userId: string;
  newestDate: string;
}) {
  useEffect(() => {
    writeLastSeen(userId, newestDate);
  }, [newestDate, userId]);

  return null;
}
