// Learn more https://docs.expo.io/guides/customizing-metro
const { withRozenite } = require("@rozenite/metro");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const {
  withVarlockMetroConfig,
} = require("@varlock/expo-integration/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
// const { withFacetpack } = require("@ecrindigital/facetpack");
// const { FileStore } = require("@expo/metro/metro-cache");
const _path = require("node:path");
const os = require("node:os");

// biome-ignore lint/correctness/noGlobalDirnameFilename: we can't use import.meta.dirname
const config = getSentryExpoConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
config.maxWorkers = Math.max(1, Math.floor(os.cpus().length * 0.5));

/**
 * `@sentry/browser` re-exports session replay from its root, so every
 * launch asset carries ~100 KB of replay code we never run (src/lib/sentry.ts
 * registers no replayIntegration). Stub the packages instead.
 */
const SENTRY_REPLAY_RE = /^@sentry\/replay(-canvas)?$/;
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) =>
  SENTRY_REPLAY_RE.test(moduleName)
    ? { type: "empty" }
    : (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);

// config.cacheStores = [
//   new FileStore({
//     root: path.join(__dirname, "node_modules", ".cache", "metro"),
//   }),
// ];

// Wrap with Uniwind first, then Rozenite, then varlock (outermost: resolves
// varlock/env subpath exports and initialises the ENV proxy in Metro).
module.exports = withVarlockMetroConfig(
  withRozenite(
    withUniwindConfig(config, {
      cssEntryFile: "./src/global.css",
      dtsFile: "./src/uniwind-types.d.ts",
    }),
    { enabled: process.env.WITH_ROZENITE === "true" }
  )
);
