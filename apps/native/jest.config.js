/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  resolver: "<rootDir>/jest.resolver.js",
  setupFiles: ["./jest.setup.tsx"],
  // jest-expo's preset ignores everything under node_modules except an
  // allowlist; phosphor-react-native ships untranspiled ESM/TSX in its
  // per-icon files (imported via deep paths in src/lib/icons.ts), so it
  // joins the allowlist. Keep the rest identical to the preset.
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|phosphor-react-native|nanoid|escape-string-regexp))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
  moduleNameMapper: {
    // `#/images/*` points at assets/, not src/ — the catch-all `#/*` mapping
    // below would otherwise miss it, so it has to come first.
    "^#/images/(.*)$": "<rootDir>/assets/images/$1",
    // The workspace hoists a second React (root 19.2.8) alongside this app's
    // own (19.2.3), and react-test-renderer resolves the hoisted one. A
    // component rendered under RTL then calls hooks on a different React
    // instance than the renderer installed, so the dispatcher is null and the
    // first useState throws. Pin every specifier to the copy that matches
    // react-test-renderer.
    "^react$": "<rootDir>/../../node_modules/react",
    "^react/(.*)$": "<rootDir>/../../node_modules/react/$1",
    // Bun isolates a stale expo@57 copy under expo-* packages (e.g.
    // expo-image/node_modules/expo) whose import-time dev-server probe
    // crashes under RN 0.88. Pin every specifier to the workspace's
    // SDK 58 preview copy until expo-atlas moves off @expo/cli 57 and
    // the nested copies disappear on a clean install.
    "^expo$": "<rootDir>/../../node_modules/expo",
    "^expo/(.*)$": "<rootDir>/../../node_modules/expo/$1",
    "^react-native-keyboard-controller$":
      "react-native-keyboard-controller/jest",
    "^heroui-native$": "<rootDir>/src/__mocks__/heroui-native.tsx",
    "^heroui-native/(.*)$": [
      "<rootDir>/src/__mocks__/heroui-native/$1.tsx",
      "<rootDir>/src/__mocks__/heroui-native.tsx",
    ],
  },
};
