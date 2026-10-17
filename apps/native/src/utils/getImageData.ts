import type { Media } from "@news-spend-media/payload/types";

/**
 * CMS media replaces a file in place, so the URL string doesn't change when
 * the image does. Android's disk image cache (Glide, via expo-image) keys
 * purely on URL and won't revalidate an unchanged one, so a swapped image
 * can be stuck for good until something busts the cache key. Appending
 * `updatedAt` forces a fresh cache entry whenever the CMS record changes.
 */
const withCacheBuster = (url: string, updatedAt?: string | null) => {
  if (!updatedAt) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(updatedAt)}`;
};

/**
 * Which of the CMS's pre-generated renditions to load. The original upload can
 * be several megabytes; a 100pt feed thumbnail needs the 400px WebP and a
 * full-width hero the 800px one. Falls back to the original when the rendition
 * is missing (older uploads, or an API response that did not populate sizes).
 */
export type ImageSize = "thumbnail" | "mobile";

/** Next-best renditions to try, smallest sensible first, before the original. */
const FALLBACK_ORDER = {
  thumbnail: ["thumbnail", "mobile", "card"],
  mobile: ["mobile", "card"],
} as const;

export const getImageData = (
  image: Media | string | null | undefined,
  size?: ImageSize
) => {
  try {
    if (!image) {
      return { url: null, blurhash: undefined, aspectRatio: undefined };
    }

    if (typeof image === "object" && image !== null) {
      const baseUrl =
        (size &&
          FALLBACK_ORDER[size]
            .map((s) => image.sizes?.[s]?.url)
            .find(Boolean)) ||
        image.url;
      return {
        url: baseUrl ? withCacheBuster(baseUrl, image.updatedAt) : null,
        blurhash: image.blurhash || undefined,
        aspectRatio:
          image.width && image.height ? image.width / image.height : undefined,
      };
    }

    if (typeof image === "string") {
      return {
        url: image,
        blurhash: undefined,
        aspectRatio: undefined,
      };
    }

    return { url: null, blurhash: undefined, aspectRatio: undefined };
  } catch (error) {
    console.error("Error parsing image data:", error);
    return { url: null, blurhash: undefined, aspectRatio: undefined };
  }
};
