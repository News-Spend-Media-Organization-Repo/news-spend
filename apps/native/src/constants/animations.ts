import { createAnimations } from "@tamagui/animations-react-native";
import { Easing } from "react-native-reanimated";

export const animations = createAnimations({
  fast: {
    type: "spring",
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
  medium: {
    type: "spring",
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  slow: {
    type: "spring",
    damping: 20,
    stiffness: 60,
  },
  quick: {
    type: "spring",
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
  easeIn: {
    type: "timing",
    easing: Easing.in(Easing.ease),
    duration: 200,
  },
  easeOut: {
    type: "timing",
    easing: Easing.out(Easing.ease),
    duration: 200,
  },
});
