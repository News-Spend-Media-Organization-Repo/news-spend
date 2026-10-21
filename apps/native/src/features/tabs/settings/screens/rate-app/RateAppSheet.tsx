import { BottomSheetView } from "@gorhom/bottom-sheet";
import NetInfo from "@react-native-community/netinfo";
import { BottomSheet } from "heroui-native/bottom-sheet";
import { useEffect, useRef, useState } from "react";
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
  ArrowSquareOutIcon,
  ChatDotsIcon,
  HeartIcon,
  SmileyIcon,
  SmileyMehIcon,
  SmileySadIcon,
  SparkleIcon,
  StarIcon,
} from "#/lib/icons";
import { openStoreReviewPage } from "#/lib/reviewPrompt/storeLink";
import { isOnline } from "#/utils/networkState";

import { Confetti } from "./Confetti";
import {
  type Mood,
  RATINGS,
  type Rating,
  ratingContent,
  TONE_COLORS,
} from "./ratingContent";

type RateAppSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Takes the user to Contact Us. Supplied by the screen that owns navigation. */
  onSendFeedback: () => void;
};

type Notice = "offline" | "unavailable" | null;

const NAVY = "#00223d";
const STAR_ON = "#FFB800";
const STAR_OFF = "#CBD5E1";

const MOOD_ICON = {
  sad: SmileySadIcon,
  meh: SmileyMehIcon,
  happy: SmileyIcon,
  love: HeartIcon,
} as const satisfies Record<Mood, unknown>;

const BEFORE_RATING = { tile: "#F1F5F9", icon: "#F5B301" };

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
          color={filled ? STAR_ON : STAR_OFF}
          name={StarIcon}
          size={38}
          weight={filled ? "fill" : "regular"}
        />
      </Animated.View>
    </Pressable>
  );
}

function ActionButton({
  label,
  leading,
  trailing,
  primary,
  onPress,
}: {
  label: string;
  leading: React.ComponentProps<typeof Icon>["name"];
  trailing?: React.ComponentProps<typeof Icon>["name"];
  primary: boolean;
  onPress: () => void;
}) {
  const color = primary ? "#FFFFFF" : NAVY;
  return (
    <Button
      className="h-14 w-full rounded-2xl"
      onPress={onPress}
      variant={primary ? "primary" : "secondary"}
    >
      <Icon color={color} name={leading} size={20} />
      <Button.Label className="font-semibold uppercase tracking-wide">
        {label}
      </Button.Label>
      {trailing ? <Icon color={color} name={trailing} size={18} /> : null}
    </Button>
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
 * or sent. They change what is emphasised, never what is available: a low
 * rating leads with feedback, but the store page stays one tap away, because
 * keeping unhappy users off the public review page is review gating.
 * Nothing here offers or implies a reward.
 */
export function RateAppSheet({
  isOpen,
  onOpenChange,
  onSendFeedback,
}: RateAppSheetProps) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [burst, setBurst] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!isOpen) {
      setRating(null);
      setNotice(null);
    }
  }, [isOpen]);

  const onStar = (next: Rating) => {
    setRating(next);
    if (next === 5) {
      setBurst((n) => n + 1);
    }
  };

  // A second tap while the first is still checking the connection would open
  // the store twice.
  const opening = useRef(false);

  const onStorePress = async () => {
    if (opening.current) {
      return;
    }
    opening.current = true;
    try {
      const connection = await NetInfo.fetch();
      if (!isOnline(connection)) {
        setNotice("offline");
        return;
      }
      const opened = await openStoreReviewPage();
      if (!opened) {
        setNotice("unavailable");
      }
    } catch {
      // A failed connection check is not a reason to crash a button press.
      setNotice("unavailable");
    } finally {
      opening.current = false;
    }
  };

  const onFeedbackPress = () => {
    onOpenChange(false);
    onSendFeedback();
  };

  const content = rating ? ratingContent(rating) : null;
  const colors = content ? TONE_COLORS[content.tone] : BEFORE_RATING;
  const TileIcon = content ? MOOD_ICON[content.mood] : SparkleIcon;

  // Who leads. Never who is shown.
  const leadWith = rating === null ? null : rating >= 4 ? "store" : "feedback";

  const storeButton = (
    <ActionButton
      key="store"
      label={
        Platform.OS === "ios" ? "Rate on the App Store" : "Rate on Google Play"
      }
      leading={StarIcon}
      onPress={onStorePress}
      primary={leadWith === "store"}
      trailing={ArrowSquareOutIcon}
    />
  );
  const feedbackButton = (
    <ActionButton
      key="feedback"
      label={leadWith === "feedback" ? "Send direct feedback" : "Send feedback"}
      leading={ChatDotsIcon}
      onPress={onFeedbackPress}
      primary={leadWith === "feedback"}
    />
  );

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* The default full-window overlay blocks the element inspector in dev. */}
      <BottomSheet.Portal disableFullWindowOverlay={__DEV__}>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          contentContainerClassName="pb-safe"
          enableDynamicSizing
          enableOverDrag={false}
        >
          <BottomSheetView>
            <View className="items-center gap-6 px-6 pt-6 pb-4">
              {rating === 5 ? <Confetti key={burst} /> : null}

              <View
                className="h-24 w-24 items-center justify-center"
                style={{ backgroundColor: colors.tile, borderRadius: 28 }}
              >
                <Icon
                  color={colors.icon}
                  name={TileIcon}
                  size={52}
                  weight={content?.mood === "love" ? "fill" : "regular"}
                />
              </View>

              <View className="items-center gap-2">
                <BottomSheet.Title className="text-center font-bold text-xl">
                  {content ? content.title : "Rate your NewsSpend experience"}
                </BottomSheet.Title>
                <Text className="text-center text-base text-secondary">
                  {content
                    ? content.subtitle
                    : "Your feedback helps us make NewsSpend better."}
                </Text>
              </View>

              <View className="flex-row items-center justify-center gap-1">
                {RATINGS.map((n) => (
                  <Star
                    filled={rating !== null && n <= rating}
                    key={n}
                    onPress={onStar}
                    rating={n}
                  />
                ))}
              </View>

              {notice ? (
                <View className="w-full items-center gap-3">
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
                  <Button
                    className="h-14 w-full rounded-2xl"
                    onPress={() => setNotice(null)}
                  >
                    <Button.Label className="font-semibold uppercase tracking-wide">
                      OK
                    </Button.Label>
                  </Button>
                </View>
              ) : (
                <View className="w-full gap-3">
                  {leadWith === "feedback"
                    ? [feedbackButton, storeButton]
                    : [storeButton, feedbackButton]}
                  <Button
                    className="h-12 w-full"
                    onPress={() => onOpenChange(false)}
                    variant="ghost"
                  >
                    <Button.Label className="text-secondary">
                      Not now
                    </Button.Label>
                  </Button>
                </View>
              )}
            </View>
          </BottomSheetView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
