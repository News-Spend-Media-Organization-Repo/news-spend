import path from "node:path";
import { fileURLToPath } from "node:url";

import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../.."
);

const nextConfig: NextConfig = {
  deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
  generateBuildId: () => process.env.RAILWAY_DEPLOYMENT_ID ?? null,
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
  // Keeps ssh2 and its optional cpu-features native binding out of the server
  // bundle — required by the cPanel SFTP storage adapter. This replaces an
  // equivalent `webpack.externals` block: declaring it here works under both
  // Webpack and Turbopack, whereas the webpack-only version made `next dev
  // --turbopack` warn that the two bundlers were configured differently.
  serverExternalPackages: ["ssh2", "cpu-features"],
  // `withPayload` always attaches a `webpack` config, and defaults `turbopack`
  // to `{}`. Next flattens the config and only counts a key it can actually
  // enumerate, so an empty object reads as "Turbopack not configured" and it
  // warns that the two bundlers disagree. Declaring the monorepo root is both
  // the correct setting here — Turbopack resolves nothing above this path —
  // and enough for that check to see a real Turbopack config.
  turbopack: {
    root: monorepoRoot,
  },
};

export default withPayload(nextConfig);
