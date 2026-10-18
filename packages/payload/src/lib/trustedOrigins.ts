/**
 * The origins the admin panel is served from, for Payload's `cors` and `csrf`.
 *
 * Nothing calls the Payload REST API cross-origin: the admin panel is
 * same-origin, and the app server talks to Payload through the local API. So
 * the list is just our own CMS hosts. `cors: "*"` invited any site to read
 * responses, and with no `csrf` list Payload accepted a cookie-authenticated
 * request from any origin a signed-in admin happened to visit.
 */
export function cmsTrustedOrigins(env: NodeJS.ProcessEnv = process.env) {
  const origins = new Set([
    "https://cms.newsspend.com",
    "https://staging-cms.newsspend.com",
  ]);

  for (const url of [env.NEXT_PUBLIC_PAYLOAD_URL, env.NEXT_PUBLIC_SITE_URL]) {
    if (url) {
      origins.add(new URL(url).origin);
    }
  }
  if (env.RAILWAY_PUBLIC_DOMAIN) {
    origins.add(`https://${env.RAILWAY_PUBLIC_DOMAIN}`);
  }
  if (env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://cms.newsspend.localhost:1355");
  }

  return [...origins];
}
