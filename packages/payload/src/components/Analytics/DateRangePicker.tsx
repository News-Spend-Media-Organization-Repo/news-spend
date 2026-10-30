"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { type DateRange, DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { formatWindow } from "./chartFormat";
import "./DateRangePicker.scss";

/** A local date as `YYYY-MM-DD`, without the UTC shift `toISOString` adds. */
function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const atMidnight = (date: string): Date => new Date(`${date}T00:00:00`);

/** Matches MAX_RANGE_DAYS in the analytics package; keep in step with it. */
const MAX_SPAN_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A two-month calendar in a popover, for a custom analytics window. Selecting
 * days only changes the calendar; the page reloads when Apply is pressed.
 */
export function DateRangePicker({
  basePath,
  from,
  to,
  platform,
  sort,
}: {
  basePath: string;
  from?: string;
  to?: string;
  platform?: string;
  sort?: string;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(
    from && to ? { from: atMidnight(from), to: atMidnight(to) } : undefined
  );
  const chosen = from && to ? formatWindow(from, to) : "Custom";
  const spanDays =
    range?.from && range.to
      ? Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS) + 1
      : 0;
  const complete = spanDays > 0 && spanDays <= MAX_SPAN_DAYS;
  const overlong = spanDays > MAX_SPAN_DAYS;

  const go = (query: URLSearchParams) => {
    if (platform) {
      query.set("platform", platform);
    }
    if (sort) {
      query.set("sort", sort);
    }
    setOpen(false);
    // A full load is fine here: the admin already reloads on navigation, and
    // this keeps the picker free of router plumbing.
    window.location.assign(`${basePath}?${query}`);
  };

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          aria-label="Choose a custom date range"
          className="ana-datepicker__trigger"
          type="button"
        >
          <CalendarDays aria-hidden="true" size={14} />
          {chosen}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          aria-label="Choose a custom date range"
          className="ana-datepicker"
          sideOffset={6}
        >
          <DayPicker
            defaultMonth={range?.from}
            mode="range"
            numberOfMonths={2}
            onSelect={setRange}
            selected={range}
          />
          <div className="ana-datepicker__footer">
            <span className="ana-datepicker__summary">
              {overlong
                ? "Choose up to a year"
                : complete && range?.from && range.to
                  ? formatWindow(isoDay(range.from), isoDay(range.to))
                  : "Pick a start and end day"}
            </span>
            <div className="ana-datepicker__actions">
              <button
                className="ana-datepicker__clear"
                onClick={() => {
                  setRange(undefined);
                  go(new URLSearchParams({ days: "30" }));
                }}
                type="button"
              >
                Clear
              </button>
              <button
                className="ana-datepicker__apply"
                disabled={!complete}
                onClick={() => {
                  if (range?.from && range.to) {
                    go(
                      new URLSearchParams({
                        from: isoDay(range.from),
                        to: isoDay(range.to),
                      })
                    );
                  }
                }}
                type="button"
              >
                Apply
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
