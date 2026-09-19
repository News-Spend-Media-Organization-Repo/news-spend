import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";

/**
 * Makes sure the camera can be opened, asking the first time.
 *
 * `launchCameraAsync` does not ask for permission; when it is missing it throws
 * MissingCameraPermissionException, and with nothing catching that it surfaced
 * as an unhandled rejection: the reader tapped "Take a picture" and nothing
 * happened.
 *
 * A reader who says no to the system prompt is left alone, since they just
 * answered. One who refused earlier gets pointed at Settings, because iOS will
 * not show the prompt a second time and tapping the option would otherwise do
 * nothing at all.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) {
    return true;
  }

  if (current.canAskAgain) {
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    return asked.granted;
  }

  Alert.alert(
    "Camera access is off",
    "To take a photo or video for your report, allow camera access for News Spend in Settings.",
    [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ]
  );
  return false;
}
