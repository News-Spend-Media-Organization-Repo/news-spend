import NetInfo from "@react-native-community/netinfo";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { Text } from "#/components/heroui/text";
import {
  HeartIcon,
  SmileyIcon,
  SmileyMehIcon,
  SmileySadIcon,
  StarIcon,
} from "#/lib/icons";
import { openStoreReviewPage } from "#/lib/reviewPrompt/storeLink";
import { isOnline } from "#/utils/networkState";

import {
  type Mood,
  RATINGS,
  type Rating,
  ratingContent,
} from "./ratingContent";

type RateAppSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Takes the user to Contact Us. Supplied by the screen that owns navigation. */
  onSendFeedback: () => void;
};

type Notice = "offline" | "unavailable" | null;

const MOOD_ICON = {
  sad: SmileySadIcon,
  meh: SmileyMehIcon,
  happy: SmileyIcon,
  love: HeartIcon,
} as const satisfies Record<Mood, unknown>;

function Star({
  rating,
  filled,
  onPress,
}: {
  rating: Rating;
  filled: boolean;
  onPress: (rating: Rating) => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    if (filled) {
      // A small pop as the star fills; short enough to feel like feedback.
      scale.value = withSequence(
        withTiming(1.18, { duration: 90 }),
        withTiming(1, { duration: 120 })
      );
    }
  }, [filled, scale]);

  return (
    <Pressable
      accessibilityLabel={rating === 1 ? "1 star" : `${rating} stars`}
      accessibilityRole="button"
      accessibilityState={{ selected: filled }}
      className="h-12 w-12 items-center justify-center"
      onPress={() => onPress(rating)}
    >
      <Animated.View style={style}>
        {/* Filled vs outlined, so selection is not carried by colour alone. */}
        <Icon
          color={filled ? "#F5B301" : undefined}
          name={StarIcon}
          size={34}
          weight={filled ? "fill" : "regular"}
        />
      </Animated.View>
    </Pressable>
  );
}

/**
 * Settings → Rate This App.
 *
 * A deliberate, user-initiated path, separate from the automatic prompt. It
 * always ends somewhere that exists (the store page or Contact Us) rather than
 * in the OS review dialog, which Apple and Google may decline to show.
 *
 * The stars are a reaction on screen and nothing more: they are never stored
 * or sent, and every rating, including one star, gets the same store button.
 * Nothing here offers or implies a reward.
 */
export function RateAppSheet({
  isOpen,
  onOpenChange,
  onSendFeedback,
}: RateAppSheetProps) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!isOpen) {
      setRating(null);
      setNotice(null);
    }
  }, [isOpen]);

  const onStorePress = async () => {
    const connection = await NetInfo.fetch();
    if (!isOnline(connection)) {
      setNotice("offline");
      return;
    }
    const opened = await openStoreReviewPage();
    if (!opened) {
      setNotice("unavailable");
    }
  };

  const onFeedbackPress = () => {
    onOpenChange(false);
    onSendFeedback();
  };

  const storeLabel =
    Platform.OS === "ios" ? "Rate on the App Store" : "Rate on Google Play";
  const content = rating ? ratingContent(rating) : null;
  const MoodIcon = content ? MOOD_ICON[content.mood] : null;

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* The default full-window overlay blocks the element inspector in dev. */}
      <BottomSheet.Portal disableFullWindowOverlay={__DEV__}>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          enableOverDrag={false}
          snapPoints={["62%"]}
        >
          <View className="items-center gap-3 px-4 pb-8">
            {MoodIcon ? (
              <Icon
                color="#00223d"
                name={MoodIcon}
                size={56}
                weight="duotone"
              />
            ) : (
              <Icon
                color="#00223d"
                name={StarIcon}
                size={56}
                weight="duotone"
              />
            )}

            <BottomSheet.Title className="text-center font-semibold text-lg">
              {content ? content.title : "Rate your NewsSpend experience"}
            </BottomSheet.Title>
            <Text className="text-center text-secondary text-sm">
              {content
                ? content.subtitle
                : "Your feedback helps us make NewsSpend better."}
            </Text>

            <View className="flex-row items-center justify-center">
              {RATINGS.map((n) => (
                <Star
                  filled={rating !== null && n <= rating}
                  key={n}
                  onPress={setRating}
                  rating={n}
                />
              ))}
            </View>

            {notice ? (
              <View className="w-full items-center gap-3 pt-2">
                <Text className="font-semibold text-base">
                  {notice === "offline"
                    ? "You're offline"
                    : "We couldn't open the store right now."}
                </Text>
                <Text className="text-center text-secondary text-sm">
                  {notice === "offline"
                    ? "Connect to the internet and try again to rate NewsSpend."
                    : "Please try again in a little while."}
                </Text>
                <Button className="w-full" onPress={() => setNotice(null)}>
                  <Button.Label>OK</Button.Label>
                </Button>
              </View>
            ) : (
              <View className="w-full gap-2 pt-2">
                <Button className="w-full" onPress={onStorePress}>
                  <Button.Label>{storeLabel}</Button.Label>
                </Button>
                <Button
                  className="w-full"
                  onPress={onFeedbackPress}
                  variant="secondary"
                >
                  <Button.Label>Send feedback</Button.Label>
                </Button>
                <Button
                  className="w-full"
                  onPress={() => onOpenChange(false)}
                  variant="ghost"
                >
                  <Button.Label>Not now</Button.Label>
                </Button>
              </View>
            )}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
