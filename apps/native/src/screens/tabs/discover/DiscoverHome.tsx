import { useNavigation } from "@react-navigation/native";
import { Gem, PlayCircle } from "@tamagui/lucide-icons";
import { useState } from "react";
import { useWindowDimensions } from "react-native";
import {
  SceneMap,
  TabBar,
  TabBarIndicator,
  TabBarItem,
  TabView,
} from "react-native-tab-view";
import { useTheme, XStack } from "tamagui";

import {
  AllTab,
  AppTab,
  BooksTab,
  GamesTab,
  MusicTab,
  SurveyTab,
} from "#/components/discover";
import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Screen } from "#/components/Screen";
import { Button } from "#/components/ui";
import { useConnectBrand } from "#/hooks/discover/useConnectBrand";

const renderScene = SceneMap({
  all: AllTab,
  apps: AppTab,
  music: MusicTab,
  games: GamesTab,
  books: BooksTab,
  surveys: SurveyTab,
});

function DiscoverHome() {
  const theme = useTheme();
  const navigation = useNavigation("DiscoverHome");
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: "all", title: "All" },
    { key: "apps", title: "Apps" },
    { key: "music", title: "Music" },
    { key: "games", title: "Games" },
    { key: "books", title: "Books" },
    { key: "surveys", title: "Surveys" },
  ]);

  const { onOpen, onCountdownComplete } = useConnectBrand();

  return (
    <Screen contentContainerStyle={{ gap: 16 }} pt="$2">
      <XStack gap="$3" px="$2">
        <PartnerAdDialog
          asChild
          onCountdownComplete={onCountdownComplete}
          onOpen={onOpen}
        >
          <Button flex={1} h="auto" py="$4">
            <Button.Icon color="white">
              <Gem />
            </Button.Icon>
            <Button.Text>Connect Brands</Button.Text>
          </Button>
        </PartnerAdDialog>

        <Button
          flex={1}
          h="auto"
          onPress={() => navigation.navigate("PlayLottery")}
          py="$4"
        >
          <Button.Icon color="white">
            <PlayCircle />
          </Button.Icon>
          <Button.Text>Play Lottery</Button.Text>
        </Button>
      </XStack>

      <TabView
        commonOptions={{
          labelStyle: {
            color: theme.s50.val,
            fontSize: 14,
            fontFamily: "Inter-SemiBold",
            textTransform: "capitalize",
          },
          sceneStyle: { backgroundColor: "white" },
        }}
        initialLayout={layout}
        lazy
        navigationState={{ index, routes }}
        onIndexChange={setIndex}
        renderScene={renderScene}
        renderTabBar={(props) => (
          <TabBar
            {...props}
            bounces
            inactiveColor="gray"
            indicatorStyle={{ backgroundColor: theme.s50.val }}
            pressColor="transparent"
            renderIndicator={(indicatorProps) => {
              const width = indicatorProps.getTabWidth(index) - 15;
              return <TabBarIndicator {...indicatorProps} width={width} />;
            }}
            renderTabBarItem={({ key, ...props }) => (
              <TabBarItem
                {...props}
                style={{ minHeight: 0, paddingVertical: 0 }}
              />
            )}
            style={{ backgroundColor: theme.p500.val }}
            tabStyle={{ width: "auto", padding: 0 }}
          />
        )}
      />
    </Screen>
  );
}

export default DiscoverHome;
