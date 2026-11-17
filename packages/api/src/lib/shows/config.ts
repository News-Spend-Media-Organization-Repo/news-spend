/**
 * Shows.ng credentials are server-only. `SHOWS_WEBHOOK_SECRET`,
 * `SHOWS_PROJECT_ID` and `SHOWS_ENV` are read where they are used (webhook,
 * signature); the client needs only the bearer credential.
 */
export type ShowsConfig = {
  credential: string;
  /** Defaults to `https://api.shows.ng/v1`. Overridden in tests. */
  baseUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export function showsConfigFromEnv(): ShowsConfig | null {
  const credential = process.env.SHOWS_API_CREDENTIAL?.trim();

  if (!credential) {
    return null;
  }

  return { credential };
}
