import { useScrollToTop } from "@react-navigation/native";
import { type ReactNode, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  type SystemBarStyle,
  SystemBars,
  type SystemBarsProps,
} from "react-native-edge-to-edge";
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";
import { type GetProps, styled, Theme, useTheme, YStack } from "tamagui";

import {
  type ExtendedEdge,
  useSafeAreaInsetsStyle,
} from "#/utils/useSafeAreaInsetsStyle";

export const DEFAULT_BOTTOM_OFFSET = 50;

const ScreenContainer = styled(YStack, {
  flex: 1,
  height: "100%",
  width: "100%",
  backgroundColor: "$background",
});

const OuterContainer = styled(YStack, {
  flex: 1,
  height: "100%",
  width: "100%",
});

const InnerContainer = styled(YStack, {
  justifyContent: "flex-start",
  alignItems: "stretch",
  flex: 1,

  variants: {
    preset: {
      fixed: {
        justifyContent: "flex-end",
      },
      scroll: {
        justifyContent: "flex-start",
      },
      auto: {
        justifyContent: "flex-start",
      },
    },
  } as const,
});

interface BaseScreenProps extends Omit<
  GetProps<typeof ScreenContainer>,
  "children"
> {
  /**
   * Children components.
   */
  children?: ReactNode;
  /**
   * Style for the outer content container useful for padding & margin.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Style for the inner content container useful for padding & margin.
   */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * Override the default edges for the safe area.
   */
  safeAreaEdges?: ExtendedEdge[];
  /**
   * Background color - can be a Tamagui token or hex color
   */
  backgroundColor?: string;
  /**
   * System bar setting. Defaults to dark.
   */
  systemBarStyle?: SystemBarStyle;
  /**
   * By how much should we offset the keyboard? Defaults to 0.
   */
  keyboardOffset?: number;
  /**
   * By how much we scroll up when the keyboard is shown. Defaults to 50.
   */
  keyboardBottomOffset?: number;
  /**
   * Custom theme name to wrap the screen with
   */
  themeName?: string;
  /**
   * Pass any additional props directly to the SystemBars component.
   */
  SystemBarsProps?: SystemBarsProps;
  /**
   * Pass any additional props directly to the KeyboardAvoidingView component.
   */
  KeyboardAvoidingViewProps?: KeyboardAvoidingViewProps;
}

interface FixedScreenProps extends BaseScreenProps {
  preset?: "fixed";
}

interface ScrollScreenProps extends BaseScreenProps {
  preset?: "scroll";
  /**
   * Should keyboard persist on screen tap. Defaults to handled.
   * Only applies to scroll preset.
   */
  keyboardShouldPersistTaps?: "handled" | "always" | "never";
  /**
   * Pass any additional props directly to the ScrollView component.
   */
  ScrollViewProps?: KeyboardAwareScrollViewProps;
}

interface AutoScreenProps extends Omit<ScrollScreenProps, "preset"> {
  preset?: "auto";
  /**
   * Threshold to trigger the automatic disabling/enabling of scroll ability.
   * Defaults to `{ percent: 0.92 }`.
   */
  scrollEnabledToggleThreshold?: { percent?: number; point?: number };
}

export type ScreenProps =
  | ScrollScreenProps
  | FixedScreenProps
  | AutoScreenProps;

const isIos = Platform.OS === "ios";

type ScreenPreset = "fixed" | "scroll" | "auto";

/**
 * Returns whether the given preset is non-scrolling.
 * @param preset - The preset to check.
 * @returns Whether the preset is non-scrolling.
 */
function isNonScrolling(preset?: ScreenPreset) {
  return !preset || preset === "fixed";
}

/**
 * Custom hook that handles the automatic enabling/disabling of scroll ability based on the content size and screen size.
 * @param {AutoScreenProps} props - The props for the `useAutoPreset` hook.
 * @returns {{boolean, Function, Function}} - The scroll state, and the `onContentSizeChange` and `onLayout` functions.
 */
function useAutoPreset(props: AutoScreenProps): {
  scrollEnabled: boolean;
  onContentSizeChange: (w: number, h: number) => void;
  onLayout: (e: LayoutChangeEvent) => void;
} {
  const { preset, scrollEnabledToggleThreshold } = props;
  const { percent = 0.92, point = 0 } = scrollEnabledToggleThreshold || {};

  const scrollViewHeight = useRef<null | number>(null);
  const scrollViewContentHeight = useRef<null | number>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  function updateScrollState() {
    if (
      scrollViewHeight.current === null ||
      scrollViewContentHeight.current === null
    )
      return;

    // check whether content fits the screen then toggle scroll state according to it
    const contentFitsScreen = (() => {
      if (point) {
        return (
          scrollViewContentHeight.current < scrollViewHeight.current - point
        );
      }
      return (
        scrollViewContentHeight.current < scrollViewHeight.current * percent
      );
    })();

    // content is less than the size of the screen, so we can disable scrolling
    if (scrollEnabled && contentFitsScreen) setScrollEnabled(false);

    // content is greater than the size of the screen, so let's enable scrolling
    if (!(scrollEnabled || contentFitsScreen)) setScrollEnabled(true);
  }

  /**
   * @param {number} w - The width of the content.
   * @param {number} h - The height of the content.
   */
  function onContentSizeChange(w: number, h: number) {
    // update scroll-view content height
    scrollViewContentHeight.current = h;
    updateScrollState();
  }

  /**
   * @param {LayoutChangeEvent} e = The layout change event.
   */
  function onLayout(e: LayoutChangeEvent) {
    const { height } = e.nativeEvent.layout;
    // update scroll-view  height
    scrollViewHeight.current = height;
    updateScrollState();
  }

  // update scroll state on every render
  if (preset === "auto") updateScrollState();

  return {
    scrollEnabled: preset === "auto" ? scrollEnabled : true,
    onContentSizeChange,
    onLayout,
  };
}

/**
 * Props for the `ScreenWithoutScrolling` component.
 */
type ScreenWithoutScrollingProps = ScreenProps;

/**
 * Renders a screen without scrolling.
 * @param props - The props for the `ScreenWithoutScrolling` component.
 * @returns The rendered `ScreenWithoutScrolling` component.
 */
function ScreenWithoutScrolling(props: ScreenProps) {
  const { style, contentContainerStyle, children, preset, ...stackProps } =
    props;

  return (
    <OuterContainer style={style} {...stackProps}>
      <InnerContainer preset={preset as any} style={contentContainerStyle}>
        {children}
      </InnerContainer>
    </OuterContainer>
  );
}

/**
 * ScreenWithScrolling component.
 *
 * @param props - The props for the ScreenWithScrolling component.
 * @returns The rendered ScreenWithScrolling component.
 */
function ScreenWithScrolling(props: ScreenProps) {
  const {
    children,
    keyboardShouldPersistTaps = "handled",
    keyboardBottomOffset = DEFAULT_BOTTOM_OFFSET,
    contentContainerStyle,
    ScrollViewProps,
    style,
    ...stackProps
  } = props as ScrollScreenProps;

  const ref = useRef<ScrollView>(null);
  const { scrollEnabled, onContentSizeChange, onLayout } = useAutoPreset(
    props as AutoScreenProps
  );

  // Add native behavior of pressing the active tab to scroll to the top of the content
  // More info at: https://reactnavigation.org/docs/use-scroll-to-top/
  useScrollToTop(ref);

  const outerStyle: ViewStyle = {
    flex: 1,
    height: "100%",
    width: "100%",
  };

  const innerStyle: ViewStyle = {
    justifyContent: "flex-start",
    alignItems: "stretch",
  };

  return (
    <KeyboardAwareScrollView
      bottomOffset={keyboardBottomOffset}
      {...{ keyboardShouldPersistTaps, scrollEnabled, ref }}
      {...ScrollViewProps}
      contentContainerStyle={[
        innerStyle,
        ScrollViewProps?.contentContainerStyle,
        contentContainerStyle,
      ]}
      onContentSizeChange={(w: number, h: number) => {
        onContentSizeChange(w, h);
        ScrollViewProps?.onContentSizeChange?.(w, h);
      }}
      onLayout={(e) => {
        onLayout(e);
        ScrollViewProps?.onLayout?.(e);
      }}
      style={[outerStyle, ScrollViewProps?.style, style]}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
/**
 * Screen component that provides a consistent layout and behavior for different screen presets.
 *
 * The `Screen` component supports presets such as "fixed", "scroll", and "auto".
 * It manages safe area insets, status bar appearance, keyboard avoiding behavior, and whether the content is scrollable based on the preset.
 *
 * This component is compatible with Tamagui and is inspired by the Ignite Screen component.
 *
 * @param props - Props for the Screen component.
 * @returns The rendered Screen component.
 */
export function Screen(props: ScreenProps) {
  const theme = useTheme();
  const {
    backgroundColor,
    KeyboardAvoidingViewProps,
    keyboardOffset = 0,
    safeAreaEdges,
    SystemBarsProps,
    systemBarStyle,
    themeName,
    ...containerProps
  } = props;

  const $containerInsets = useSafeAreaInsetsStyle(safeAreaEdges);
  const isFixed = isNonScrolling(props.preset);

  const ScreenContent = (
    <ScreenContainer
      backgroundColor={backgroundColor || "$background"}
      style={$containerInsets}
      {...containerProps}
    >
      <SystemBars style={systemBarStyle || "dark"} {...SystemBarsProps} />

      {isFixed ? (
        // For fixed preset, don't use KeyboardAvoidingView to prevent shifting of absolutely positioned elements
        <ScreenWithoutScrolling {...props} />
      ) : (
        <KeyboardAvoidingView
          behavior={"padding"}
          keyboardVerticalOffset={keyboardOffset}
          {...KeyboardAvoidingViewProps}
          style={[{ flex: 1 }, KeyboardAvoidingViewProps?.style]}
        >
          <ScreenWithScrolling {...props} />
        </KeyboardAvoidingView>
      )}
    </ScreenContainer>
  );

  if (themeName) {
    return <Theme name={themeName}>{ScreenContent}</Theme>;
  }

  return ScreenContent;
}

// Export additional styled components for advanced use cases
export const ScreenScrollView = styled(ScrollView, {
  flex: 1,
  backgroundColor: "$background",
});

export const ScreenStack = styled(YStack, {
  flex: 1,
  backgroundColor: "$background",
});

// Type exports
// export type { ExtendedEdge, SystemBarStyle };
// export type ScreenPreset = "fixed" | "scroll" | "auto"
