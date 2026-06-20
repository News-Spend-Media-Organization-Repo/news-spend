import { useNavigation } from "@react-navigation/native";
import { PlayCircleIcon, SketchLogoIcon } from "phosphor-react-native";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { SceneMap, TabBar, TabBarIndicator, TabBarItem, TabView } from "react-native-tab-view";
import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { useConnectBrand } from "#/hooks/discover/useConnectBrand";
import { AllTab, AppTab, BooksTab, GamesTab, MusicTab, SurveyTab } from "./components";

const renderScene = SceneMap({
  all: AllTab,
  apps: AppTab,
  music: MusicTab,
  games: GamesTab,
  books: BooksTab,
  surveys: SurveyTab,
});

function DiscoverHome() {
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
    <Screen contentContainerClassName="gap-4" systemBarStyle="light">
      <View className="flex-row gap-3 px-2 pt-3">
        <PartnerAdDialog asChild onCountdownComplete={onCountdownComplete} onOpen={onOpen}>
          <Button className="flex-1">
            <SketchLogoIcon color="white" size={20} weight="bold" />
            <Button.Label>Connect Brands</Button.Label>
          </Button>
        </PartnerAdDialog>

        <Button className="flex-1" onPress={() => navigation.navigate("PlayLottery")}>
          <PlayCircleIcon color="white" size={20} weight="bold" />
          <Button.Label>Play Lottery</Button.Label>
        </Button>
      </View>

      <TabView
        commonOptions={{
          labelStyle: {
            color: "#ffffff",
            fontSize: 14,
            // fontFamily: "Inter-Light",
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
            indicatorStyle={{ backgroundColor: "#ffffff" }}
            pressColor="transparent"
            renderIndicator={(indicatorProps) => {
              const width = indicatorProps.getTabWidth(index) - 15;
              return <TabBarIndicator {...indicatorProps} width={width} />;
            }}
            renderTabBarItem={({ key, ...props }) => (
              <TabBarItem {...props} style={{ minHeight: 0, paddingVertical: 0 }} />
            )}
            style={{ backgroundColor: "#00223d" }}
            tabStyle={{ width: "auto", padding: 0 }}
          />
        )}
      />
    </Screen>
  );
}

export default DiscoverHome;
