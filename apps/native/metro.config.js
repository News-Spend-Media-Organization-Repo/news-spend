// Learn more https://docs.expo.io/guides/customizing-metro
const { withRozenite } = require("@rozenite/metro");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
// const { withFacetpack } = require("@ecrindigital/facetpack");
// const { FileStore } = require("@expo/metro/metro-cache");
const path = require("node:path");
const os = require("node:os");

const config = getSentryExpoConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
config.maxWorkers = Math.max(1, Math.floor(os.cpus().length * 0.5));

// config.cacheStores = [
//   new FileStore({
//     root: path.join(__dirname, "node_modules", ".cache", "metro"),
//   }),
// ];

module.exports = withRozenite(config, {
  enabled: process.env.WITH_ROZENITE === "true",
});
