import { useNavigation } from "@react-navigation/native";
import { useCallback } from "react";

/**
 * Back that still works when there is nothing to go back to. A notification or
 * link that cold-starts the app builds a stack holding only the target screen,
 * so a bare `goBack()` is a silent no-op there.
 *
 * A reset, not a navigate: navigating to "Tab" would push a second one and
 * leave this screen underneath, so back from Home would land here again.
 *
 * Detail screens live in the signed-in group, so Home is always a valid target.
 */
export function useSafeBack() {
  const navigation = useNavigation();

  return useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{ name: "Tab", params: { screen: "Home" } }],
    });
  }, [navigation]);
}
