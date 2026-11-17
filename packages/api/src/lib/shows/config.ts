/**
 * Shows.ng credentials are server-only. `SHOWS_ENV` is the money-safety switch:
 * anything but "live" disables the client unless `SHOWS_BASE_URL` names a
 * sandbox host, so a deploy that never set it can never take real payments.
 * `SHOWS_WEBHOOK_SECRET` and `SHOWS_PROJECT_ID` are read by the webhook.
 */
export type ShowsConfig = {
  credential: string;
  /** Absent means the live host; set for a sandbox or a proxy. */
  baseUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export function showsConfigFromEnv(): ShowsConfig | null {
  const credential = process.env.SHOWS_API_CREDENTIAL?.trim();

  if (!credential) {
    return null;
  }

  const environment = process.env.SHOWS_ENV?.trim();
  const baseUrl = process.env.SHOWS_BASE_URL?.trim();

  if (environment !== "live" && !baseUrl) {
    return null;
  }

  return { credential, ...(baseUrl ? { baseUrl } : {}) };
}
