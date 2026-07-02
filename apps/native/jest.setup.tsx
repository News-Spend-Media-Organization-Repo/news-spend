// react-native-edge-to-edge — native module for system bars
jest.mock("react-native-edge-to-edge", () => ({
  SystemBars: ({ children }: any) => children,
}));

// uniwind — styling hooks
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

// phosphor-react-native — icon library
jest.mock("phosphor-react-native", () => {
  const MockIcon = ({ ...props }: any) => null;
  return {
    ArrowLeftIcon: MockIcon,
    EyeIcon: MockIcon,
    EyeSlashIcon: MockIcon,
  };
});

// sonner-native — toast notifications
jest.mock("sonner-native", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
  Toaster: () => null,
}));
