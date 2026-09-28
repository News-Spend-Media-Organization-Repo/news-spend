import { useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  type FlatList,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { useMarkInteractive } from "#/hooks/useMarkInteractive";
import { markOnboardingSeen } from "#/state/onboarding";

/** Dots morph between these widths as the carousel scrolls. */
const DOT_SMALL = 8;
const DOT_LARGE = 24;

type OnboardingPage = {
  key: string;
  source: React.ComponentProps<typeof Image>["source"];
  aspectRatio: number;
  imageLabel: string;
  title: ReactNode;
  body: string;
  cta: string;
};

const PAGES: OnboardingPage[] = [
  {
    key: "one",
    source: require("#/images/onboarding-1.png"),
    aspectRatio: 2000 / 1333,
    imageLabel: "People enjoying meaningful online connections",
    title: "Your Time Online Should Move Your Life Forward",
    body: "Discover a new world where everyday digital engagement opens the door to meaningful, life-enhancing opportunities.",
    cta: "Move Your Life Forward",
  },
  {
    key: "two",
    source: require("#/images/onboarding-2.png"),
    aspectRatio: 1,
    imageLabel: "People turning everyday engagement into rewards",
    title: (
      <>
        Meet Today’s Needs.{" "}
        <Text className="text-s-300">Build Tomorrow’s Dreams</Text>.
      </>
    ),
    body: "Turn your everyday engagement into rewards that support your basic needs and bring your biggest aspirations within reach.",
    cta: "Continue",
  },
  {
    key: "three",
    source: require("#/images/onboarding-3.png"),
    aspectRatio: 1,
    imageLabel: "A person planning a successful future",
    title: (
      <>
        <Text className="text-s-300">Take Control</Text> of your Future
      </>
    ),
    body: "Access valuable information, rewarding opportunities and practical tools designed to help you make progress and shape a better future.",
    cta: "Create an Account",
  },
];

type DotProps = {
  dotIndex: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
};

const Dot = ({ dotIndex, pageWidth, scrollX }: DotProps) => {
  const inputRange = [
    (dotIndex - 1) * pageWidth,
    dotIndex * pageWidth,
    (dotIndex + 1) * pageWidth,
  ] as const;

  // The shell grows from the inactive to the active width while the fill
  // sweeps across it, so the pill is only ever the accent colour once it is
  // wide enough to hold it — no colour interpolation, no layout jumps.
  const shellStyle = useAnimatedStyle(() => ({
    width: interpolate(
      scrollX.value,
      inputRange,
      [DOT_SMALL, DOT_LARGE, DOT_SMALL],
      Extrapolation.CLAMP
    ),
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: interpolate(
      scrollX.value,
      inputRange,
      [0, DOT_LARGE, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <Animated.View
      className="h-2 overflow-hidden rounded-full bg-p-100"
      style={shellStyle}
    >
      <Animated.View className="h-2 rounded-full bg-p-500" style={fillStyle} />
    </Animated.View>
  );
};

const Onboarding = () => {
  const navigation = useNavigation("Onboarding");
  const { width: pageWidth } = useWindowDimensions();

  const scrollX = useSharedValue(0);
  const footerProgress = useSharedValue(1);
  const listRef = useRef<FlatList<OnboardingPage>>(null);
  const [index, setIndex] = useState(0);

  useMarkInteractive(true);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  // pagingEnabled lands the list on a whole page, so the nearest index is the
  // current one. Android can end a drag without a momentum phase, hence the
  // second sync.
  const syncIndex = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setIndex(Math.min(Math.max(next, 0), PAGES.length - 1));
  };

  const onScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(event.nativeEvent.velocity?.x ?? 0) < 0.5) {
      syncIndex(event);
    }
  };

  useEffect(() => {
    if (!PAGES[index]) {
      return;
    }
    footerProgress.value = 0;
    footerProgress.value = withTiming(1, { duration: 240 });
  }, [footerProgress, index]);

  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerProgress.value,
    transform: [
      { translateY: interpolate(footerProgress.value, [0, 1], [12, 0]) },
    ],
  }));

  const isLastPage = index === PAGES.length - 1;

  const goToPage = (next: number) => {
    listRef.current?.scrollToIndex({ animated: true, index: next });
  };

  const handleSkip = () => {
    markOnboardingSeen();
    navigation.replace("Welcome");
  };

  const handlePrimary = () => {
    if (!isLastPage) {
      goToPage(index + 1);
      return;
    }
    markOnboardingSeen();
    navigation.navigate("TOS", { goto: "SignUp" });
  };

  const handleLogIn = () => {
    markOnboardingSeen();
    navigation.navigate("TOS", { goto: "SignIn" });
  };

  const renderItem = ({ item }: ListRenderItemInfo<OnboardingPage>) => (
    <View className="px-6" style={{ width: pageWidth }}>
      <View className="flex-1 items-center justify-center">
        <Image
          accessibilityLabel={item.imageLabel}
          contentFit="contain"
          source={item.source}
          style={{
            width: "100%",
            aspectRatio: item.aspectRatio,
          }}
        />
      </View>

      <View className="items-center gap-3">
        <Text className="text-center text-p-500" variant="HeadingLarge">
          {item.title}
        </Text>
        <Text className="text-center text-gray-50" variant="body">
          {item.body}
        </Text>
      </View>
    </View>
  );

  return (
    <Screen
      className="bg-p-50"
      navigationBarButtonStyle="dark"
      preset="fixed"
      safeAreaEdges={["top", "bottom"]}
      statusBarStyle="dark"
    >
      <View className="px-6">
        <Pressable
          accessibilityLabel="Skip onboarding"
          accessibilityRole="button"
          className="self-end py-2"
          hitSlop={10}
          onPress={handleSkip}
        >
          <Text className="font-semibold text-p-500 text-sm">Skip</Text>
        </Pressable>
      </View>

      <Animated.FlatList
        data={PAGES}
        getItemLayout={(_, i) => ({
          index: i,
          length: pageWidth,
          offset: pageWidth * i,
        })}
        horizontal
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={syncIndex}
        onScroll={onScroll}
        onScrollEndDrag={onScrollEndDrag}
        pagingEnabled
        ref={listRef}
        renderItem={renderItem}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        testID="onboarding-pages"
      />

      <View className="gap-6 px-6 pt-8 pb-2">
        <View
          accessibilityLabel={`Onboarding screen ${index + 1} of ${PAGES.length}`}
          accessibilityRole="progressbar"
          accessibilityValue={{ max: PAGES.length, min: 1, now: index + 1 }}
          className="flex-row items-center justify-center gap-2"
        >
          {PAGES.map((page, i) => (
            <Dot
              dotIndex={i}
              key={page.key}
              pageWidth={pageWidth}
              scrollX={scrollX}
            />
          ))}
        </View>

        <Animated.View className="gap-3" style={footerStyle}>
          <Button className="bg-p-500" onPress={handlePrimary} size="lg">
            <Button.Label className="text-p-50">
              {PAGES[index]?.cta}
            </Button.Label>
          </Button>

          {isLastPage ? (
            <Button onPress={handleLogIn} size="lg" variant="outline">
              <Button.Label className="text-p-500">Log In</Button.Label>
            </Button>
          ) : null}
        </Animated.View>
      </View>
    </Screen>
  );
};

export default Onboarding;
