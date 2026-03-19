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
};

export default withPayload(nextConfig);
