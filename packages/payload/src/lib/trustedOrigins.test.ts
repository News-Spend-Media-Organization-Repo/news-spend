import { describe, expect, test } from "vitest";

import { cmsTrustedOrigins } from "./trustedOrigins";

describe("cmsTrustedOrigins", () => {
  test("production lists only our CMS hosts", () => {
    expect(cmsTrustedOrigins({ NODE_ENV: "production" })).toEqual([
      "https://cms.newsspend.com",
      "https://staging-cms.newsspend.com",
    ]);
  });

  test("adds configured URLs by origin, and the Railway domain", () => {
    expect(
      cmsTrustedOrigins({
        NODE_ENV: "production",
        NEXT_PUBLIC_PAYLOAD_URL: "https://cms.example.com/admin",
        RAILWAY_PUBLIC_DOMAIN: "cms-production.up.railway.app",
      })
    ).toEqual([
      "https://cms.newsspend.com",
      "https://staging-cms.newsspend.com",
      "https://cms.example.com",
      "https://cms-production.up.railway.app",
    ]);
  });

  test("allows local dev hosts outside production only", () => {
    expect(cmsTrustedOrigins({ NODE_ENV: "development" })).toContain(
      "http://localhost:3000"
    );
    expect(cmsTrustedOrigins({ NODE_ENV: "production" })).not.toContain(
      "http://localhost:3000"
    );
  });
});
