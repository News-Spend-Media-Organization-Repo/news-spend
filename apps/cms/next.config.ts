import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["ssh2", "ssh2-sftp-client", "cpu-features"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push(/^cpu-features/, /^ssh2$/, /^ssh2-sftp-client$/);
      }
    }
    return config;
  },
};

export default withPayload(nextConfig);
