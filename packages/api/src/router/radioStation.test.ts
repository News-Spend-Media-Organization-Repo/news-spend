import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";

import { expectError, mockContext } from "../test-utils";
import { radioStationRouter } from "./radioStation";

// ---------------------------------------------------------------------------
// Mock: radio-browser-api
// ---------------------------------------------------------------------------

type MockStation = {
  id: string;
  name: string;
  tags: string[];
};

const GENRE_TAGS = [
  "pop",
  "rock",
  "jazz",
  "afrobeats",
  "classical",
  "electronic",
  "hiphop",
  "reggae",
  "country",
] as const;

class MockRadioBrowserApi {
  name: string;
  second: boolean;

  constructor(name: string, second: boolean) {
    this.name = name;
    this.second = second;
  }

  searchStations = (opts: Record<string, unknown>): MockStation[] => {
    const key = (opts.tag ?? opts.country) as string;
    return Array.from({ length: 12 }, (_, i) => ({
      id: `${key}-${i}`,
      name: `Station ${i}`,
      tags: [key],
    }));
  };

  getStationsByVotes = async (n: number): Promise<MockStation[]> =>
    Array.from({ length: n }, (_, i) => ({
      id: `s-${i}`,
      name: `Station ${i}`,
      tags: [],
    }));
}

mock.module("radio-browser-api", () => ({
  default: MockRadioBrowserApi,
  RadioBrowserApi: MockRadioBrowserApi,
}));

// ---------------------------------------------------------------------------
// Mock: node-internet-radio
// ---------------------------------------------------------------------------

type InternetRadioCallback = (
  error: Error | null,
  station?: Record<string, unknown>
) => void;

// Each test overrides this to control the callback result.
let internetRadioHandler: (url: string, cb: InternetRadioCallback) => void = (
  _url,
  cb
) => cb(null, { name: "Mock Station", url: _url });

mock.module("node-internet-radio", () => ({
  default: {
    getStationInfo: (url: string, cb: InternetRadioCallback) =>
      internetRadioHandler(url, cb),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("radioStationRouter.byGenreGroup", () => {
  it("returns Nigeria first plus 9 genre groups, each sliced to 10 stations", async () => {
    const result = await call(radioStationRouter.byGenreGroup, undefined, {
      context: mockContext(),
    });

    // 1 Nigeria + 9 genres = 10 groups
    expect(result).toHaveLength(10);

    // Nigeria is first
    expect(result[0]).toMatchObject({ displayName: "Nigeria" });
    expect(result[0]?.stations).toHaveLength(10);

    // Remaining groups match the genre order
    for (let i = 0; i < GENRE_TAGS.length; i++) {
      const group = result[i + 1];
      expect(group).toBeDefined();
      expect(group?.stations).toHaveLength(10);
    }
  });

  it("slices each genre group to a maximum of 10 stations", async () => {
    const result = await call(radioStationRouter.byGenreGroup, undefined, {
      context: mockContext(),
    });

    for (const group of result) {
      expect(group.stations.length).toBeLessThanOrEqual(10);
    }
  });
});

describe("radioStationRouter.top", () => {
  it("returns exactly `limit` stations", async () => {
    // Make Math.random deterministic so shuffle is a no-op
    const originalRandom = Math.random;
    Math.random = () => 0;

    const result = await call(
      radioStationRouter.top,
      { limit: 5 },
      { context: mockContext() }
    );

    expect(result).toHaveLength(5);
    Math.random = originalRandom;
  });

  it("returns an empty array when the upstream API throws", async () => {
    mock.module("radio-browser-api", () => {
      class FailingApi {
        getStationsByVotes = () => Promise.reject(new Error("upstream down"));
        searchStations = async () => [];
      }
      return { default: FailingApi, RadioBrowserApi: FailingApi };
    });

    const result = await call(
      radioStationRouter.top,
      { limit: 10 },
      { context: mockContext() }
    );

    expect(result).toEqual([]);

    // Restore the working mock for subsequent tests
    mock.module("radio-browser-api", () => ({
      default: MockRadioBrowserApi,
      RadioBrowserApi: MockRadioBrowserApi,
    }));
  });
});

describe("radioStationRouter.getStreamMetadata", () => {
  it("returns metadata with success:true on a valid stream URL", async () => {
    const stationData = { name: "Cool FM", url: "https://stream.example.com" };
    internetRadioHandler = (_url, cb) => cb(null, stationData);

    const result = await call(
      radioStationRouter.getStreamMetadata,
      { streamUrl: "https://stream.example.com" },
      { context: mockContext() }
    );

    expect(result).toEqual({ metadata: stationData, success: true });
  });

  it("returns null metadata with success:false when the stream lookup fails", async () => {
    internetRadioHandler = (_url, cb) => cb(new Error("stream not found"));

    const result = await call(
      radioStationRouter.getStreamMetadata,
      { streamUrl: "https://bad-stream.example.com" },
      { context: mockContext() }
    );

    expect(result).toEqual({ metadata: null, success: false });
  });

  it("rejects with BAD_REQUEST for an invalid URL", async () => {
    const error = await expectError(
      call(
        radioStationRouter.getStreamMetadata,
        { streamUrl: "not-a-url" },
        { context: mockContext() }
      )
    );

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
  });
});
