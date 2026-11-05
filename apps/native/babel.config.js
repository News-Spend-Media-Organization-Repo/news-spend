module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Replaces ENV.xxx references to non-sensitive items at compile time.
      // See https://varlock.dev/integrations/expo/
      require("@varlock/expo-integration/babel-plugin"),
      // babel-preset-expo assumes Hermes accepts a rest parameter bound to a
      // destructuring pattern, `(...[a, b]) => {}`. hermesc rejects it as an
      // "invalid destructuring target", failing the export, so force the
      // downlevel that the preset otherwise skips for the hermes engine.
      require.resolve("@babel/plugin-transform-parameters"),
    ],
  };
};
