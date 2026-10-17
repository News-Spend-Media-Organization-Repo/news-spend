import type { ComponentProps } from "react";
import { useState } from "react";

import { Image } from "#/components/heroui/image";

type SizedImageProps = ComponentProps<typeof Image> & {
  /**
   * The original upload, used if the rendition in `source` fails to load.
   */
  fallbackSource?: ComponentProps<typeof Image>["source"];
};

const sourceKey = (source: unknown): string | undefined => {
  if (typeof source === "string") {
    return source;
  }
  if (source && typeof source === "object" && "uri" in source) {
    return (source as { uri?: string }).uri;
  }
  return;
};

/**
 * An image that loads a sized rendition and falls back to the original.
 *
 * The CMS records a URL for each rendition (the 400px and 800px WebP) whether
 * or not the file ever landed in storage: in production about one in ten news
 * images and a third of partner ad images have a rendition that returns 404.
 * Without a fallback those show only their blurhash.
 */
export const SizedImage = ({
  source,
  fallbackSource,
  onError,
  ...props
}: SizedImageProps) => {
  const key = sourceKey(source);
  const [failedKey, setFailedKey] = useState<string | undefined>();
  const useFallback =
    fallbackSource != null && key !== undefined && failedKey === key;

  return (
    <Image
      {...props}
      onError={(event) => {
        setFailedKey(key);
        onError?.(event);
      }}
      source={useFallback ? fallbackSource : source}
    />
  );
};
