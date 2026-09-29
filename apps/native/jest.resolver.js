/**
 * jest-expo resolves through @react-native/jest-preset's resolver, which keeps
 * `.native.*` files — correct for React Native, wrong for react-native-worklets,
 * whose `.native` implementation talks to a native module jest never loads
 * (`Cannot read properties of undefined (reading 'loadUnpackers')`).
 *
 * Worklets ships a resolver that strips native extensions for exactly this;
 * we chain it in front and fall back to the preset resolver for anything that
 * only exists as a `.native` file.
 */
const presetResolver = require("@react-native/jest-preset/jest/resolver.js");

const isWorkletsRequest = (value) =>
  typeof value === "string" && value.includes("react-native-worklets");

module.exports = (request, options) => {
  if (isWorkletsRequest(request) || isWorkletsRequest(options.basedir)) {
    try {
      return options.defaultResolver(request, {
        ...options,
        extensions: options.extensions?.filter(
          (extension) => !extension.includes("native")
        ),
      });
    } catch {
      // every path under this request is `.native`-only; use the preset rules
    }
  }

  return presetResolver(request, options);
};
