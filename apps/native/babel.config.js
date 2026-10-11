module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Replaces ENV.xxx references to non-sensitive items at compile time.
      // See https://varlock.dev/integrations/expo/
      require("@varlock/expo-integration/babel-plugin"),
    ],
  };
};
