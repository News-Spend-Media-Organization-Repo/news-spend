import { describe, expect, it } from "vitest";
import { showNotificationSection } from "../Giveaways";

describe("showNotificationSection", () => {
  it("shows the section when announcements are on or undecided", () => {
    expect(showNotificationSection({ sendAnnouncement: true })).toBe(true);
    expect(showNotificationSection({})).toBe(true);
    expect(showNotificationSection(null)).toBe(true);
    expect(showNotificationSection(undefined)).toBe(true);
  });

  it("hides the section when announcements are switched off", () => {
    expect(showNotificationSection({ sendAnnouncement: false })).toBe(false);
  });
});
