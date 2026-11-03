import type { PartnerContent } from "@news-spend-media/payload/types";
import NetInfo from "@react-native-community/netinfo";
import { Directory, File, Paths } from "expo-file-system";

import { storage } from "#/utils/storage";

/**
 * Ads are downloaded once and played from disk, the way AdMob hands over an
 * already-loaded creative. A remote URL would start fetching only when the
 * dialog/sheet mounts, which is exactly when the viewer is waiting.
 */
const DIR = new Directory(Paths.cache, "ad-videos");
const MAX_CREATIVES = 3;

const inFlight = new Map<string, Promise<string | null>>();

/** The remote source for a partner video, or null when it is not one. */
export function adVideoUrl(ad: PartnerContent): string | null {
  if (ad.type !== "video") {
    return null;
  }
  if (ad.videoType !== "UPLOAD" && ad.videoType !== "EXTERNAL") {
    return null;
  }
  const url =
    ad.videoUrl?.trim() ||
    (typeof ad.video === "object" ? ad.video?.url : null) ||
    null;
  return url || null;
}

/** The local file for an ad, if a previous preload finished. */
export function cachedAdVideoUri(adId: string): string | null {
  try {
    const file = new File(DIR, `${adId}.mp4`);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Mirrors useVideoSettings.shouldPrefetch: data saver only blocks prefetching
 * over mobile data, where downloading a creative unasked would be rude.
 */
async function canPrefetch(): Promise<boolean> {
  try {
    const raw = storage.getString("video_settings");
    const dataSaver = raw ? JSON.parse(raw)?.dataSaver === true : false;
    if (!dataSaver) {
      return true;
    }
    const net = await NetInfo.fetch();
    return net.type === "wifi";
  } catch {
    return true;
  }
}

function fileFor(adId: string): File {
  return new File(DIR, `${adId}.mp4`);
}

/**
 * Keep the newest few creatives. Reading the directory (rather than tracking
 * downloads in memory) means files from previous launches are counted too.
 */
function pruneCreatives(): void {
  try {
    if (!DIR.exists) {
      return;
    }
    const files = DIR.list()
      .filter((entry): entry is File => entry instanceof File)
      .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
    for (const stale of files.slice(MAX_CREATIVES)) {
      stale.delete();
    }
  } catch {
    // Best effort; the OS empties the cache directory under pressure anyway.
  }
}

export async function preloadAdVideo(
  ad: PartnerContent
): Promise<string | null> {
  const url = adVideoUrl(ad);
  // HLS is a playlist of segments; downloading the playlist alone is useless.
  if (!url || url.includes(".m3u8")) {
    return null;
  }

  const cached = cachedAdVideoUri(ad.id);
  if (cached) {
    return cached;
  }
  const running = inFlight.get(ad.id);
  if (running) {
    return running;
  }
  if (!(await canPrefetch())) {
    return null;
  }

  const task = (async () => {
    try {
      if (!DIR.exists) {
        DIR.create({ intermediates: true, idempotent: true });
      }
      const file = await File.downloadFileAsync(url, fileFor(ad.id), {
        idempotent: true,
      });
      pruneCreatives();
      return file.uri;
    } catch {
      // A half-written file would look cached forever and never play.
      try {
        fileFor(ad.id).delete();
      } catch {
        // Nothing was written.
      }
      return null;
    } finally {
      inFlight.delete(ad.id);
    }
  })();

  inFlight.set(ad.id, task);
  return task;
}

/** Test seam: forget in-flight downloads. */
export function resetAdVideoCacheForTests(): void {
  inFlight.clear();
}
