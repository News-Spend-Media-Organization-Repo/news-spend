import { H4, Paragraph, Stack } from "tamagui";

import { Screen } from "#/components/Screen";
import { StyledSafeAreaView } from "#/components/StyledSafeAreaView";

function How() {
  return (
    <Screen>
      <Stack px="$4" pt="$2">
        <H4 color="$p400" textAlign="center">
          How to get Reward Points?
        </H4>

        <Stack>
          <Paragraph fontSize={16}>You can get Reward Points by</Paragraph>
          <Stack>
            <Paragraph fontSize={16}>{`\u25CF`} Daily sign in</Paragraph>
            <Paragraph fontSize={16}>
              {`\u25CF`} Sharing posted news on other social media networks
              (WhatsApp, Twitter, Instagram)
            </Paragraph>
          </Stack>
        </Stack>
      </Stack>
    </Screen>
  );
}

export default How;
