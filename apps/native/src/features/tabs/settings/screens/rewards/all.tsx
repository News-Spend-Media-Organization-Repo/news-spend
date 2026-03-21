import { H4, Stack } from "tamagui";

import { Screen } from "#/components/Screen";

function All() {
  return (
    <Screen>
      <Stack px="$4" pt="$2">
        <H4 color="$p400" textAlign="center">
          All Rewards
        </H4>
      </Stack>
    </Screen>
  );
}

export default All;
