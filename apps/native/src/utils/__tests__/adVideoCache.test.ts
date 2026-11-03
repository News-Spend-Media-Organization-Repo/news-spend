import type { PartnerContent } from "@news-spend-media/payload/types";
import NetInfo from "@react-native-community/netinfo";
import { storage } from "#/utils/storage";

import {
  adVideoUrl,
  cachedAdVideoUri,
  preloadAdVideo,
  resetAdVideoCacheForTests,
} from "../adVideoCache";

const mockFiles = new Map<string, boolean>();
let mockDownloads = 0;
let mockDownloadFails = false;

jest.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    exists = true;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts
        .map((p) => (typeof p === "string" ? p : p.uri))
        .join("/");
    }

    create() {}

    list() {
      return [...mockFiles.keys()].map((uri, index) => {
        const file = new File(uri);
        file.modificationTime = index + 1;
        return file;
      });
    }
  }

  class File {
    uri: string;
    modificationTime = 0;

    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts
        .map((p) => (typeof p === "string" ? p : p.uri))
        .join("/");
    }

    get exists() {
      return mockFiles.has(this.uri);
    }

    static async downloadFileAsync(_url: string, destination: File) {
      mockDownloads += 1;
      mockFiles.set(destination.uri, true);
      if (mockDownloadFails) {
        throw new Error("network");
      }
      return destination;
    }

    delete() {
      mockFiles.delete(this.uri);
    }
  }

  return { Directory, File, Paths: { cache: new Directory("file:///cache") } };
});

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn() },
}));

jest.mock("#/utils/storage", () => ({ storage: { getString: jest.fn() } }));

const videoAd = (overrides: Partial<PartnerContent> = {}) =>
  ({
    id: "ad-1",
    type: "video",
    videoType: "EXTERNAL",
    videoUrl: "https://cdn.test/ad-1.mp4",
    video: null,
    ...overrides,
  }) as unknown as PartnerContent;

describe("adVideoCache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    mockDownloads = 0;
    mockDownloadFails = false;
    resetAdVideoCacheForTests();
    (storage.getString as jest.Mock).mockReturnValue(null);
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ type: "wifi" });
  });

  it("resolves the remote URL for video ads and nothing for banners", () => {
    expect(adVideoUrl(videoAd())).toBe("https://cdn.test/ad-1.mp4");
    expect(adVideoUrl(videoAd({ type: "banner" }))).toBeNull();
  });

  it("downloads once and reuses the cached file", async () => {
    const uri = await preloadAdVideo(videoAd());

    expect(uri).toBe("file:///cache/ad-videos/ad-1.mp4");
    expect(mockDownloads).toBe(1);
    expect(cachedAdVideoUri("ad-1")).toBe(uri);

    await preloadAdVideo(videoAd());
    expect(mockDownloads).toBe(1);
  });

  it("does not download HLS playlists", async () => {
    const hls = videoAd({ videoUrl: "https://cdn.test/ad-1.m3u8" });

    expect(adVideoUrl(hls)).toBe("https://cdn.test/ad-1.m3u8");
    await expect(preloadAdVideo(hls)).resolves.toBeNull();
    expect(mockDownloads).toBe(0);
  });

  it("skips prefetch when data saver is on over cellular", async () => {
    (storage.getString as jest.Mock).mockReturnValue(
      JSON.stringify({ dataSaver: true })
    );
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ type: "cellular" });

    await expect(preloadAdVideo(videoAd())).resolves.toBeNull();
    expect(mockDownloads).toBe(0);

    (NetInfo.fetch as jest.Mock).mockResolvedValue({ type: "wifi" });
    await expect(preloadAdVideo(videoAd())).resolves.toBe(
      "file:///cache/ad-videos/ad-1.mp4"
    );
    expect(mockDownloads).toBe(1);
  });

  it("deletes a partial download so the next attempt retries", async () => {
    mockDownloadFails = true;
    await expect(preloadAdVideo(videoAd())).resolves.toBeNull();
    expect(cachedAdVideoUri("ad-1")).toBeNull();

    mockDownloadFails = false;
    await expect(preloadAdVideo(videoAd())).resolves.toBe(
      "file:///cache/ad-videos/ad-1.mp4"
    );
    expect(mockDownloads).toBe(2);
  });

  it("prunes creatives already on disk after a restart", async () => {
    mockFiles.set("file:///cache/ad-videos/ad-0.mp4", true);
    resetAdVideoCacheForTests();

    for (let i = 1; i <= 3; i++) {
      await preloadAdVideo(videoAd({ id: `ad-${i}` }));
    }

    expect(cachedAdVideoUri("ad-0")).toBeNull();
    expect(mockFiles.size).toBe(3);
  });

  it("keeps only the last three creatives", async () => {
    for (let i = 1; i <= 4; i++) {
      await preloadAdVideo(videoAd({ id: `ad-${i}` }));
    }

    expect(cachedAdVideoUri("ad-1")).toBeNull();
    expect(cachedAdVideoUri("ad-2")).not.toBeNull();
    expect(cachedAdVideoUri("ad-4")).not.toBeNull();
    expect(mockFiles.size).toBe(3);
  });
});
