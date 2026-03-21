import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { IdCard, Info, RefreshCw, Star, Trash2 } from "@tamagui/lucide-icons";
import { useQuery } from "@tanstack/react-query";
import {
  ArticleIcon,
  BellRingingIcon,
  ChartLineIcon,
  HardDrivesIcon,
  LockKeyIcon,
  PhoneCallIcon,
  ShareIcon,
  UserIcon,
} from "phosphor-react-native";
import { type ReactElement, useCallback, useMemo, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Avatar,
  ListItem,
  Paragraph,
  Progress,
  Spinner,
  Stack,
  Text,
  XStack,
} from "tamagui";
import { useSnapshot } from "valtio";

import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui/Button";
import { orpc } from "#/lib/orpc";
import { authState, isAnonymous, logout } from "#/state/auth";
import { randomColor } from "#/utils/index";

type SettingsItem = {
  title: string;
  icon: ReactElement;
  screen: any;
  // screen: keyof RootParamList;
  authRequired?: boolean;
};

const settingsItems: SettingsItem[] = [
  {
    title: "Profile",
    icon: <UserIcon size={24} />,
    screen: "Profile",
    authRequired: true,
  },
  {
    title: "Activities",
    icon: <ChartLineIcon size={24} />,
    screen: "Activities",
    authRequired: true,
  },
  {
    title: "IWitness Report",
    icon: <ArticleIcon size={24} />,
    screen: "Report",
  },
  {
    title: "Notification manager",
    icon: <BellRingingIcon size={24} />,
    screen: "Notification",
    authRequired: true,
  },
  {
    title: "Data manager",
    icon: <HardDrivesIcon size={24} />,
    screen: "DataManager",
    authRequired: true,
  },
  {
    title: "Verify Identity",
    icon: <IdCard size={24} />,
    screen: "VerifyIdentity",
    authRequired: true,
  },
  {
    title: "Contact us",
    icon: <PhoneCallIcon size={24} />,
    screen: "Support",
  },
  {
    title: "Legal Agreement",
    icon: <LockKeyIcon size={24} />,
    screen: "Legal",
  },
  {
    title: "Rate this app",
    icon: <Star size={24} />,
    screen: "RateApp",
  },
  {
    title: "Share this app",
    icon: <ShareIcon size={24} />,
    screen: "ShareApp",
  },
  {
    title: "Follow us",
    icon: <Info size={24} />,
    screen: "Socials",
  },
  {
    title: "Delete Account",
    icon: <Trash2 color="$red10" size={24} />,
    screen: "DeleteAccount",
    authRequired: true,
  },
];

function SettingsHome() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Using useCallback to memoize the logout handler.
  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);

    try {
      await logout();
    } catch (error) {
      // Optionally handle error (e.g., show a message)
      console.error("Logout failed:", error);
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  // Memoize navigation handler to prevent recreating on every render
  const handlePress = useCallback(
    async (screen: any, authRequired = false) => {
      console.log(authState.user?.isAnonymous);
      if (authRequired && (!authState.user || authState.user?.isAnonymous)) {
        return navigation.navigate("SignIn");
      }

      if (screen === "RateApp") {
        const storeUrl = Platform.select({
          ios: "https://apps.apple.com/us/app/news-spend/id1550745257",
          android: "market://details?id=com.newsspend.media",
        });

        try {
          const supported = await Linking.canOpenURL(storeUrl!);
          if (supported) {
            await Linking.openURL(storeUrl!);
          } else {
            Alert.alert("Error", "Unable to open the store page.");
          }
        } catch (error) {
          console.error("Error opening the store page:", error);
          Alert.alert("Error", "An error occurred. Please try again later.");
        }
        return;
      }
      navigation.navigate(screen);
    },
    [navigation]
  );

  return (
    <Screen>
      <LegendList
        // estimatedItemSize={100}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        data={settingsItems}
        ItemSeparatorComponent={() => <Stack h="$1.5" />}
        keyExtractor={(item) => item.title}
        ListHeaderComponent={ListHeaderComponent}
        renderItem={({ item }) => (
          <ListItem
            bg="$p50"
            color={item.title === "Delete Account" ? "$red10" : undefined}
            fontSize={16}
            fontWeight="700"
            icon={() => item.icon}
            onPress={() => handlePress(item.screen, Boolean(item.authRequired))}
            pressTheme
          >
            {item.title}
          </ListItem>
        )}
        showsVerticalScrollIndicator={false}
      />
      <Button
        bottom={20 + insets.bottom}
        disabled={isLoggingOut}
        left={0}
        mx="$4"
        onPress={handleLogout}
        position="absolute"
        primary
        right={0}
      >
        {isLoggingOut ? (
          <Button.Icon>
            <Spinner />
          </Button.Icon>
        ) : null}
        <Button.Text>Log Out</Button.Text>
      </Button>
    </Screen>
  );
}

function ListHeaderComponent() {
  const navigation = useNavigation();
  const { user } = useSnapshot(authState);
  const isGuest = isAnonymous();
  const {
    data: totalPoints,
    isPending,
    isLoading,
    isFetching,
    isRefetching,
    refetch,
  } = useQuery(
    orpc.activity.totalPoints.queryOptions({
      enabled: Boolean(user),
      refetchInterval: 10 * 60 * 1000,
    })
  );

  const avatarBg = useMemo(() => randomColor(), []);

  // Maximum points value could be stored in a constant or come from a config
  const maxValue = 60_000;
  const progressPercentage = Math.round(((totalPoints ?? 0) / maxValue) * 100);

  return (
    <Stack bg="$p50" gap="$3" mb="$5" pt="$4" px="$3">
      <XStack ai="center" gap="$3" mb="$2">
        <Avatar backgroundColor={avatarBg} circular size="$6">
          <Text color="#fff" fos="$8">
            {user?.name?.[0] ? user?.name?.[0].toUpperCase() : "G"}
          </Text>
        </Avatar>
        <Stack flex={1}>
          <Paragraph size="$4">
            ID:{" "}
            <Text borderWidth={5} width={50}>
              {isGuest ? "Guest" : user?.user_id}
            </Text>
          </Paragraph>
          <Paragraph fontSize={18} fontWeight="700" textTransform="capitalize">
            {isGuest ? "Guest" : (user?.username ?? user?.name)}
          </Paragraph>
        </Stack>
      </XStack>
      <XStack ai="center" jc="space-between" pb="$3">
        <Stack>
          <XStack ai="center" gap="$1">
            {user ? (
              <Button h="auto" onPress={() => refetch()} unstyled w="auto">
                <Button.Text
                  color="black"
                  fontSize={24}
                  fontWeight="700"
                  m="$0"
                >
                  {totalPoints ?? 0}
                </Button.Text>
                <Button.Icon color="$p500">
                  {isLoading || isRefetching ? (
                    <Spinner color="$gray" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                </Button.Icon>
              </Button>
            ) : null}
          </XStack>
          <Text color="$gray.50" fontSize={10}>
            Rewards Points
          </Text>
        </Stack>
        <Button
          onPress={() =>
            navigation.navigate("Tab", {
              screen: "Discover",
              params: {
                initial: false,
                screen: "PlayLottery",
              },
            })
          }
        >
          <Button.Text>Use Points</Button.Text>
        </Button>
      </XStack>

      <Stack>
        <Progress bg="$s300" h="$1.5" value={Math.max(progressPercentage, 3)}>
          <Progress.Indicator
            animation="medium"
            bg="$p500"
            borderRadius={999}
          />
        </Progress>
        <Paragraph fontSize="$4" fow="700" m="$0">
          {totalPoints ?? 0} / {maxValue.toLocaleString()} points
        </Paragraph>
      </Stack>
    </Stack>
  );
}

export default SettingsHome;
