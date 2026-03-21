// Learn more https://docs.expo.io/guides/customizing-metro
const { withRozenite } = require("@rozenite/metro");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
// const { withFacetpack } = require("@ecrindigital/facetpack");
// const { FileStore } = require("@expo/metro/metro-cache");
const path = require("node:path");

const config = getSentryExpoConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

// config.cacheStores = [
//   new FileStore({
//     root: path.join(__dirname, "node_modules", ".cache", "metro"),
//   }),
// ];

module.exports = withRozenite(config, {
  enabled: process.env.WITH_ROZENITE === "true",
});
