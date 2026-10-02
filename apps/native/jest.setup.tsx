// uniwind: styling hooks
jest.mock("uniwind", () => ({
  useUniwind: jest.fn(() => ({ theme: "light" })),
  useCSSVariable: jest.fn(() => "#000000"),
  withUniwind: jest.fn((Component: any) => Component),
  cn: jest.fn((...args: any[]) => args.filter(Boolean).join(" ")),
}));

// react-native-safe-area-context
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: ({ children, ...props }: any) => {
    const View = require("react-native").View;
    return <View {...props}>{children}</View>;
  },
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  initialWindowMetrics: {
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    frame: { x: 0, y: 0, width: 390, height: 844 },
  },
  SafeAreaInsetsContext: {
    Consumer: ({ children }: any) =>
      children({ top: 0, right: 0, bottom: 0, left: 0 }),
  },
}));

// react-native-reanimated: the real entrypoint calls runOnUISync at import
// time, which worklets 0.13 only implements on native (and the native side
// needs a TurboModule jest never loads), so neither variant imports under
// jest. This stands in for the handful of APIs screens use: shared values
// behave like refs, style/scroll handlers run inline on the JS thread, and
// animated components render as their RN counterparts.
jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View, Text, ScrollView, FlatList } = require("react-native");
  const animatedComponents = { View, Text, ScrollView, FlatList };
  return {
    __esModule: true,
    default: animatedComponents,
    ...animatedComponents,
    Extrapolation: { EXTEND: "extend", CLAMP: "clamp", IDENTITY: "identity" },
    interpolate: (_value, _inputRange, outputRange) => outputRange[0],
    useSharedValue: (initial) => {
      const ref = React.useRef({ value: initial });
      return ref.current;
    },
    useAnimatedStyle: (fn) => fn(),
    useAnimatedScrollHandler: (handlers) => {
      if (typeof handlers === "function") {
        return handlers;
      }
      return handlers.onScroll ?? (() => {});
    },
    useAnimatedRef: () => ({ current: null }),
    useDerivedValue: (fn) => ({ value: fn() }),
    withTiming: (value) => value,
    withSpring: (value) => value,
    withDelay: (_delay, value) => value,
    withSequence: (...values) => values.at(-1),
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    createAnimatedComponent: (Component) => Component,
  };
});

// phosphor-react-native: icon library
jest.mock("phosphor-react-native", () => {
  const MockIcon = ({ ...props }: any) => null;
  return {
    ArrowLeftIcon: MockIcon,
    EyeIcon: MockIcon,
    EyeSlashIcon: MockIcon,
  };
});

// #/components/heroui/toast: toast notifications
jest.mock("#/components/heroui/toast", () => {
  const toast = jest.fn();
  toast.show = jest.fn();
  toast.error = jest.fn();
  toast.success = jest.fn();
  toast.info = jest.fn();
  toast.warning = jest.fn();
  toast.loading = jest.fn();
  toast.custom = jest.fn();
  toast.dismiss = jest.fn();
  return { toast, ToastBridge: () => null };
});
