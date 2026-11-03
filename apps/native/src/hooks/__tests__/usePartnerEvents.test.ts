const mockEnqueue = jest.fn();
let mockSessionId = "session-1";

jest.mock("#/lib/partnerEventsClient", () => ({
  partnerEventsClient: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    currentSessionId: () => mockSessionId,
  },
}));

import { renderHook } from "@testing-library/react-native";

import {
  resetPartnerImpressionsForTests,
  usePartnerEvents,
} from "../usePartnerEvents";

beforeEach(() => {
  mockEnqueue.mockReset();
  mockSessionId = "session-1";
  resetPartnerImpressionsForTests();
});

const setup = async () =>
  (await renderHook(() => usePartnerEvents())).result.current;

describe("usePartnerEvents", () => {
  it("enqueues a repeat impression once per session, content and surface", async () => {
    const { trackImpression } = await setup();
    trackImpression("c1", "news-post", 2);
    trackImpression("c1", "news-post", 2);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      contentId: "c1",
      event: "impression",
      surface: "news-post",
      position: 2,
    });
  });

  it("counts a different surface again", async () => {
    const { trackImpression } = await setup();
    trackImpression("c1", "news-post");
    trackImpression("c1", "video-section");
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it("counts again in a new session", async () => {
    const { trackImpression } = await setup();
    trackImpression("c1", "news-post");
    mockSessionId = "session-2";
    trackImpression("c1", "news-post");
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it("does not remember the old session once a new one starts", async () => {
    const { trackImpression } = await setup();
    trackImpression("c1", "news-post");
    mockSessionId = "session-2";
    trackImpression("c2", "news-post");
    mockSessionId = "session-1";
    trackImpression("c1", "news-post");
    expect(mockEnqueue).toHaveBeenCalledTimes(3);
  });

  it("always enqueues clicks", async () => {
    const { trackClick } = await setup();
    trackClick("c1", "news-post");
    trackClick("c1", "news-post");
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ event: "click" })
    );
  });

  it("enqueues each video event with its own name", async () => {
    const { trackVideo } = await setup();
    trackVideo("c1", "video_start", "connect-brand-video");
    trackVideo("c1", "video_complete", "connect-brand-video");
    expect(mockEnqueue).toHaveBeenNthCalledWith(1, {
      contentId: "c1",
      event: "video_start",
      surface: "connect-brand-video",
    });
    expect(mockEnqueue).toHaveBeenNthCalledWith(2, {
      contentId: "c1",
      event: "video_complete",
      surface: "connect-brand-video",
    });
  });

  it("returns stable functions", async () => {
    const hook = await renderHook(() => usePartnerEvents());
    const first = hook.result.current;
    await hook.rerender({});
    expect(hook.result.current.trackImpression).toBe(first.trackImpression);
    expect(hook.result.current.trackClick).toBe(first.trackClick);
  });
});
