import { useNavigation } from "@react-navigation/native";
import { Button, H1, Stack } from "tamagui";

const NotFound = () => {
  const navigation = useNavigation();

  const onGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Tab", {
        screen: "Home",
      });
    }
  };

  return (
    <Stack ai="center" jc="center">
      <H1>Page not found</H1>
      <Button onPress={onGoBack} theme="dark">
        {navigation.canGoBack() ? "Go back" : "Go home"}
      </Button>
    </Stack>
  );
};

export default NotFound;
