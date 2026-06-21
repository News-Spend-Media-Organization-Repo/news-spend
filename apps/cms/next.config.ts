import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  deploymentId: process.env.RAILWAY_DEPLOYMENT_ID,
  generateBuildId: () => process.env.RAILWAY_DEPLOYMENT_ID ?? null,
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  output: "standalone",
  serverExternalPackages: ["ssh2", "cpu-features"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push(/^cpu-features/, /^ssh2$/);
      }
    }
    return config;
  },
};

export default withPayload(nextConfig);
