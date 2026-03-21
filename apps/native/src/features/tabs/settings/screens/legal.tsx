import { useNavigation } from "@react-navigation/native";
import { ChevronRight } from "@tamagui/lucide-icons";
import { ListItem, Separator, YGroup } from "tamagui";

import { Screen } from "#/components/Screen";

export default function LegalAgreement() {
  const navigation = useNavigation();

  return (
    <Screen>
      <YGroup borderRadius={0} alignSelf="center" bordered size="$4">
        <YGroup.Item>
          <ListItem
            onPress={() => navigation.navigate("TermsOfUse")}
            title="Terms of Use"
            iconAfter={ChevronRight}
          />
        </YGroup.Item>
        <Separator />
        <YGroup.Item>
          <ListItem
            onPress={() => navigation.navigate("PrivacyPolicy")}
            title="Privacy Policy"
            iconAfter={ChevronRight}
          />
        </YGroup.Item>
      </YGroup>
    </Screen>
  );
}
