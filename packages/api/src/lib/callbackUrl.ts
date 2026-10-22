/**
 * Provider callbacks sign the URL they actually called. The host this process
 * sees is internal behind Railway, so reconstruct the public origin from the
 * proxy headers first, then Railway's own domain, then the request itself.
 *
 * Never rebuild the query from parsed input: any reordering or re-encoding
 * changes the signature.
 */

export type CallbackUrlSource = "forwarded" | "railway" | "request";

export type SignedCallbackUrl = {
  url: string;
  source: CallbackUrlSource;
  path: string;
};

/** Drops one query parameter, leaving every other byte untouched. */
export function removeQueryParam(rawQuery: string, name: string): string {
  return rawQuery
    .split("&")
    .filter((part) => {
      const separator = part.indexOf("=");
      const key = separator === -1 ? part : part.slice(0, separator);
      return key !== name;
    })
    .join("&");
}

export function publicOriginForRequest(request: {
  url: string;
  headers: Headers;
}): { origin: string; source: CallbackUrlSource } {
  const url = new URL(request.url);
  const forwarded = (name: string) =>
    request.headers.get(name)?.split(",")[0]?.trim();

  const forwardedHost = forwarded("x-forwarded-host");
  if (forwardedHost) {
    const proto =
      forwarded("x-forwarded-proto") ?? url.protocol.replace(":", "");
    return { origin: `${proto}://${forwardedHost}`, source: "forwarded" };
  }

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) {
    return {
      origin: railwayDomain.includes("://")
        ? railwayDomain
        : `https://${railwayDomain}`,
      source: "railway",
    };
  }

  return { origin: url.origin, source: "request" };
}

export function signedCallbackUrl(
  request: { url?: string; headers: Headers } | undefined,
  signatureParam = "hash"
): SignedCallbackUrl | null {
  if (!request?.url) {
    return null;
  }

  const withoutQuery = request.url.split("?")[0] ?? "";
  const afterScheme = withoutQuery.slice(withoutQuery.indexOf("://") + 3);
  const pathStart = afterScheme.indexOf("/");
  const path = pathStart === -1 ? "/" : afterScheme.slice(pathStart);
  const rawQuery = request.url.split("?").slice(1).join("?");
  const query = removeQueryParam(rawQuery, signatureParam);
  const { origin, source } = publicOriginForRequest({
    url: request.url,
    headers: request.headers,
  });
  const base = `${origin}${path}`;

  return { url: query ? `${base}?${query}` : base, source, path };
}
