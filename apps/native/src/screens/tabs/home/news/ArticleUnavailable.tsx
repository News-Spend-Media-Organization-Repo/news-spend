import { View } from "react-native";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { ArrowLeftIcon } from "#/lib/icons";

type ArticleUnavailableProps = {
  onBack: () => void;
  onGoToLatest: () => void;
};

/**
 * Shown when the API says the article does not exist: unpublished, deleted or
 * renamed since a push or shared link was sent. Distinct from the load-failure
 * state, where the article may well exist and a retry could succeed.
 */
export const ArticleUnavailable = ({
  onBack,
  onGoToLatest,
}: ArticleUnavailableProps) => (
  <Screen
    // `className` lands on Screen's outer wrapper; the inner container that
    // holds the children is `items-stretch justify-start`, so centring has to
    // be asked of that one.
    contentContainerClassName="items-center justify-center gap-6 px-6"
    navigationBarButtonStyle="dark"
    statusBarStyle="auto"
  >
    <Button
      accessibilityLabel="Go back"
      className="absolute top-safe-offset-2 left-2.5 z-20 size-8 rounded-full bg-white/80"
      onPress={onBack}
      variant="ghost"
    >
      <ArrowLeftIcon color="#00223d" size={20} />
    </Button>
    <View className="items-center gap-2">
      <Text className="text-center" variant="HeadingLarge">
        This article is no longer available
      </Text>
      <Text className="text-center">
        It may have been removed or its link has changed.
      </Text>
    </View>
    <Button onPress={onGoToLatest}>
      <Button.Label>See the latest news</Button.Label>
    </Button>
  </Screen>
);
