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

export const getImageData = (image: Media | string | null | undefined) => {
  try {
    if (!image) {
      return { url: null, blurhash: undefined };
    }

    if (typeof image === "object" && image !== null) {
      return {
        url: image.url ? withCacheBuster(image.url, image.updatedAt) : null,
        blurhash: image.blurhash || undefined,
      };
    }

    if (typeof image === "string") {
      return {
        url: image,
        blurhash: undefined,
      };
    }

    return { url: null, blurhash: undefined };
  } catch (error) {
    console.error("Error parsing image data:", error);
    return { url: null, blurhash: undefined };
  }
};
