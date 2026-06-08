/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["./jest.setup.tsx"],
  moduleNameMapper: {
    "^react-native-keyboard-controller$": "react-native-keyboard-controller/jest",
    "^heroui-native$": "<rootDir>/src/__mocks__/heroui-native.tsx",
    "^heroui-native/(.*)$": "<rootDir>/src/__mocks__/heroui-native/$1.tsx",
  },
};
