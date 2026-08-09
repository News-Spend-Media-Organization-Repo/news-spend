const RETRYABLE_MESSAGES = [
  "fetch failed",
  "network request failed",
  "ssl",
  "handshake",
  "connection abort",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
];

/**
 * Check if an error is a network/SSL error that's worth retrying.
 * These are transient errors caused by unstable connections,
 * especially common on mobile networks in regions with high latency.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return RETRYABLE_MESSAGES.some((needle) => message.includes(needle));
  }

  // AbortSignal timeout
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return false;
}
