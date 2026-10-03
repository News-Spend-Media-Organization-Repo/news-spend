import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { Tabs } from "react-native-collapsible-tab";
import { PartnerAdDialog } from "#/components/discover/PartnerAdDialog";
import { Button } from "#/components/heroui/button";
import { Screen } from "#/components/heroui/screen";
import { useConnectBrand } from "#/hooks/discover/useConnectBrand";
import { useMarkInteractive } from "#/hooks/useMarkInteractive";
import { trackDiscover } from "#/lib/discoverAnalyticsClient";
import { PlayCircleIcon, SketchLogoIcon } from "#/lib/icons";

import { AllTab, AppTab, BooksTab, GamesTab, SurveyTab } from "./components";
import { AnimatedTabBar } from "./components/animated-tab-bar";
import { TabBarHeightProvider } from "./components/tab-bar-height-context";

function DiscoverHeader() {
  const navigation = useNavigation("DiscoverHome");
  const { onOpen, onCountdownComplete } = useConnectBrand();

  const openBrands = useCallback((): boolean => {
    trackDiscover({ event: "open", itemType: "brands" });
    return onOpen();
  }, [onOpen]);

  return (
    <View className="flex-row gap-3 bg-white px-2 py-3">
      <PartnerAdDialog
        asChild
        onCountdownComplete={onCountdownComplete}
        onOpen={openBrands}
      >
        <Button className="flex-1">
          <SketchLogoIcon color="white" size={20} weight="bold" />
          <Button.Label>Connect Brands</Button.Label>
        </Button>
      </PartnerAdDialog>

      <Button
        className="flex-1"
        onPress={() => {
          trackDiscover({ event: "open", itemType: "giveaway" });
          navigation.navigate("PlayLottery");
        }}
      >
        <PlayCircleIcon color="white" size={20} weight="bold" />
        <Button.Label>Giveaway</Button.Label>
      </Button>
    </View>
  );
}

function DiscoverHome() {
  const [tabBarHeight, setTabBarHeight] = useState(0);
  const handleTabBarLayout = useCallback((height: number) => {
    setTabBarHeight(height);
  }, []);

  // The tab shell (header buttons, tab bar) is interactive on first render;
  // individual tabs manage their own loading states.
  useMarkInteractive(true);

  // Which section is showing, so opening Discover is recorded against the
  // section the person lands on (the last one they used stays selected).
  const sectionRef = useRef("all");

  useFocusEffect(
    useCallback(() => {
      trackDiscover({ event: "view", section: sectionRef.current });
    }, [])
  );

  const handleTabChange = useCallback(({ tabName }: { tabName: string }) => {
    sectionRef.current = tabName;
    trackDiscover({ event: "section", section: tabName });
  }, []);

  return (
    <Screen statusBarStyle="light">
      <TabBarHeightProvider value={tabBarHeight}>
        <Tabs.Container
          containerStyle={{ flex: 1 }}
          headerBackgroundColor="#ffffff"
          initialTabName="all"
          lazy
          onTabChange={handleTabChange}
          renderHeader={DiscoverHeader}
          renderTabBar={(props) => (
            <AnimatedTabBar
              activeLabelClassName="font-semibold text-sm"
              inactiveLabelClassName="text-xs font-medium"
              onLayout={handleTabBarLayout}
              tabClassName="pb-1"
              {...props}
            />
          )}
          revealHeaderOnScroll
        >
          <Tabs.Tab label="All" name="all">
            <AllTab />
          </Tabs.Tab>
          <Tabs.Tab label="Apps" name="apps">
            <AppTab />
          </Tabs.Tab>
          <Tabs.Tab label="Games" name="games">
            <GamesTab />
          </Tabs.Tab>
          <Tabs.Tab label="Books" name="books">
            <BooksTab />
          </Tabs.Tab>
          <Tabs.Tab label="Surveys" name="surveys">
            <SurveyTab />
          </Tabs.Tab>
        </Tabs.Container>
      </TabBarHeightProvider>
    </Screen>
  );
}

export default DiscoverHome;
