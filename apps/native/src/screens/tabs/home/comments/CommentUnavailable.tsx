import { View } from "react-native";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { ArrowLeftIcon } from "#/lib/icons";

type BackArrowProps = { onBack: () => void };

/**
 * Comment screens are reached from a push or a shared link, where back may be
 * the only way out, so every state they can get stuck in needs this.
 */
export const BackArrow = ({ onBack }: BackArrowProps) => (
  <Button
    accessibilityLabel="Go back"
    className="absolute top-safe-offset-2 left-2.5 z-20 size-8 rounded-full bg-white/80"
    onPress={onBack}
    variant="ghost"
  >
    <ArrowLeftIcon color="#00223d" size={20} />
  </Button>
);

type CommentUnavailableProps = {
  title: string;
  message: string;
  onBack: () => void;
  action?: { label: string; onPress: () => void } | undefined;
};

/**
 * Shown when a comment or its article no longer exists (removed, hidden,
 * deleted since a push was sent), or when loading failed. The `action` is what
 * the reader can do next: open the article, go to the news, or retry.
 */
export const CommentUnavailable = ({
  title,
  message,
  onBack,
  action,
}: CommentUnavailableProps) => (
  <Screen
    contentContainerClassName="items-center justify-center gap-6 px-6"
    navigationBarButtonStyle="dark"
    statusBarStyle="auto"
  >
    <BackArrow onBack={onBack} />
    <View className="items-center gap-2">
      <Text className="text-center" variant="HeadingLarge">
        {title}
      </Text>
      <Text className="text-center">{message}</Text>
    </View>
    {action ? (
      <Button onPress={action.onPress}>
        <Button.Label>{action.label}</Button.Label>
      </Button>
    ) : null}
  </Screen>
);
