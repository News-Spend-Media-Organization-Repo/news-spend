import { Linking } from "react-native";
import { Paragraph, Stack } from "tamagui";

import { Screen } from "#/components/Screen";

const Email = () => {
  return (
    <Screen>
      <Stack p="$3" gap="$4">
        <Paragraph>
          Please email us at{" "}
          <Paragraph
            onPress={() => Linking.openURL("mailto:support@newspend.com")}
            color="blue"
            fow="600"
            textDecorationLine="underline"
          >
            support@newspend.com
          </Paragraph>{" "}
          and we'll get back to you shortly.
        </Paragraph>
      </Stack>
    </Screen>
  );
};
export default Email;
