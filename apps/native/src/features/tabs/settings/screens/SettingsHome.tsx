import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  Card,
  cn,
  ListGroup,
  PressableFeedback,
  Separator,
  Spinner,
  useThemeColor,
} from "heroui-native";
import {
  ArrowClockwiseIcon,
  ArticleIcon,
  BellRingingIcon,
  ChartLineIcon,
  HardDrivesIcon,
  IdentificationBadgeIcon,
  IdentificationCardIcon,
  LockKeyIcon,
  PhoneCallIcon,
  ShareIcon,
  StarIcon,
  TrashIcon,
  UserIcon,
} from "phosphor-react-native";
import { Fragment, useCallback, useMemo, useState } from "react";
import { Alert, Linking, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSnapshot } from "valtio";
import { Button } from "#/components/heroui/button";
import { Icon } from "#/components/heroui/icon";
import { ProgressBar } from "#/components/heroui/progress";
import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";
import { orpc } from "#/lib/orpc";
import { authState, isAnonymous, logout } from "#/state/auth";
import { randomColor } from "#/utils/index";

type SettingsItem = {
  title: string;
  icon: typeof UserIcon;
  screen: any;
  authRequired?: boolean;
  danger?: boolean;
};

const settingsItems: SettingsItem[] = [
  {
    title: "Profile",
    icon: UserIcon,
    screen: "Profile",
    authRequired: true,
  },
  {
    title: "Activities",
    icon: ChartLineIcon,
    screen: "Activities",
    authRequired: true,
  },
  {
    title: "IWitness Report",
    icon: ArticleIcon,
    screen: "Report",
  },
  {
    title: "Notification manager",
    icon: BellRingingIcon,
    screen: "Notification",
    authRequired: true,
  },
  {
    title: "Data manager",
    icon: HardDrivesIcon,
    screen: "DataManager",
    authRequired: true,
  },
  {
    title: "Verify Identity",
    icon: IdentificationCardIcon,
    screen: "VerifyIdentity",
    authRequired: true,
  },
  { title: "Contact us", icon: PhoneCallIcon, screen: "Support" },
  {
    title: "Legal Agreement",
    icon: LockKeyIcon,
    screen: "Legal",
  },
  { title: "Rate this app", icon: StarIcon, screen: "RateApp" },
  {
    title: "Share this app",
    icon: ShareIcon,
    screen: "ShareApp",
  },
  { title: "Follow us", icon: IdentificationBadgeIcon, screen: "Socials" },
  {
    title: "Delete Account",
    icon: TrashIcon,
    screen: "DeleteAccount",
    authRequired: true,
    danger: true,
  },
];

function SettingsHome() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  const handlePress = useCallback(
    async (screen: any, authRequired = false) => {
      if (authRequired && (!authState.user || authState.user?.isAnonymous)) {
        return navigation.navigate("SignIn");
      }
      if (screen === "RateApp") {
        const storeUrl = Platform.select({
          ios: "https://apps.apple.com/us/app/news-spend/id1550745257",
          android: "market://details?id=com.newsspend.app",
        });
        try {
          const supported = await Linking.canOpenURL(storeUrl!);
          if (supported) {
            await Linking.openURL(storeUrl!);
          } else {
            Alert.alert("Error", "Unable to open the store page.");
          }
        } catch {
          Alert.alert("Error", "An error occurred. Please try again later.");
        }
        return;
      }
      navigation.navigate(screen);
    },
    [navigation],
  );

  return (
    <Screen systemBarStyle="light">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <ListHeader onPress={handlePress} />
      </ScrollView>
      <Button
        className="absolute right-0 bottom-safe-offset-4 left-0 mx-4"
        isDisabled={isLoggingOut}
        onPress={handleLogout}
      >
        {isLoggingOut ? <Spinner /> : null}
        <Button.Label>Log Out</Button.Label>
      </Button>
    </Screen>
  );
}

// ─── ListHeader ───────────────────────────────────────────────────────────────

type ListHeaderProps = {
  onPress: (screen: any, authRequired?: boolean) => void;
};

function ListHeader({ onPress }: ListHeaderProps) {
  const navigation = useNavigation();
  const { user } = useSnapshot(authState);
  const isGuest = isAnonymous();
  const dangerColor = useThemeColor("danger");

  const {
    data: totalPoints,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery(
    orpc.activity.totalPoints.queryOptions({
      enabled: Boolean(user) && !user?.isAnonymous,
      refetchInterval: 10 * 60 * 1000,
    }),
  );

  const avatarBg = useMemo(() => randomColor(), []);
  const maxValue = 60_000;
  const progressPercentage = Math.round(((totalPoints ?? 0) / maxValue) * 100);

  return (
    <View className="gap-4 px-4 pt-4">
      <Card className="gap-3 rounded-xl px-3 pt-4 pb-4">
        <Card.Header className="mb-2 flex-row items-center gap-3">
          <Avatar size="lg" style={{ backgroundColor: avatarBg }}>
            <Avatar.Image />
            <Avatar.Fallback>
              {user?.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </Avatar.Fallback>
          </Avatar>
          <View className="flex-1">
            <Text className="font-semibold text-lg">
              ID: <Text>{isGuest ? "Guest" : user?.user_id}</Text>
            </Text>
            <Text className="font-semibold text-md uppercase">
              {isGuest ? "Guest" : (user?.username ?? user?.name)}
            </Text>
          </View>
        </Card.Header>

        <Card.Body className="flex-row items-center justify-between pb-3">
          <View>
            <View className="flex-row items-center gap-1">
              {user ? (
                <Button onPress={() => refetch()} variant="ghost">
                  <Button.Label className="font-semibold text-lg">{totalPoints ?? 0}</Button.Label>
                  {isLoading || isRefetching ? (
                    <Spinner color="default" size="sm" />
                  ) : (
                    <Icon name={ArrowClockwiseIcon} size={16} weight="regular" />
                  )}
                </Button>
              ) : null}
            </View>
            <Text>Rewards Points</Text>
          </View>
          <Button
            onPress={() =>
              navigation.navigate("Tab", {
                screen: "Discover",
                params: { initial: false, screen: "PlayLottery" },
              })
            }
          >
            <Button.Label>Use Points</Button.Label>
          </Button>
        </Card.Body>

        <Card.Footer>
          <ProgressBar size="lg" value={Math.max(progressPercentage, 3)} />
          <Text className="mt-1 font-semibold">
            {totalPoints ?? 0} / {maxValue.toLocaleString()} points
          </Text>
        </Card.Footer>
      </Card>

      <ListGroup>
        {settingsItems.map((item, index) => (
          <Fragment key={item.title}>
            <PressableFeedback
              animation={false}
              onPress={() => onPress(item.screen, Boolean(item.authRequired))}
            >
              <PressableFeedback.Scale>
                <ListGroup.Item disabled>
                  <ListGroup.ItemPrefix>
                    <Icon
                      color={item.danger ? dangerColor : undefined}
                      name={item.icon}
                      size={22}
                    />
                  </ListGroup.ItemPrefix>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle className={cn(item.danger ? "text-danger" : undefined)}>
                      {item.title}
                    </ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix />
                </ListGroup.Item>
              </PressableFeedback.Scale>
              <PressableFeedback.Ripple />
            </PressableFeedback>
            {index < settingsItems.length - 1 && <Separator className="mx-4" />}
          </Fragment>
        ))}
      </ListGroup>
    </View>
  );
}

export default SettingsHome;
