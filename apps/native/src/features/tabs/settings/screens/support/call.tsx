import { Linking } from "react-native";
import { Paragraph, Stack } from "tamagui";

import { Screen } from "#/components/Screen";

const Call = () => {
  return (
    <Screen>
      <Stack p="$3" gap="$4">
        <Paragraph>
          Please reach out to us at{" "}
          <Paragraph
            onPress={() => Linking.openURL("tel:+12265073364")}
            color="blue"
            fontWeight="600"
            textDecorationLine="underline"
          >
            +1 (226) 507-3364
          </Paragraph>{" "}
          or{" "}
          <Paragraph
            onPress={() => Linking.openURL("tel:+2349153849852")}
            color="blue"
            fontWeight="600"
            textDecorationLine="underline"
          >
            +234 915 384 9852
          </Paragraph>{" "}
          and we'll get back to you shortly.
        </Paragraph>
      </Stack>
    </Screen>
  );
};
export default Call;
