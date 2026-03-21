import { XCircle } from "@tamagui/lucide-icons";
import { Toast, useToastState } from "@tamagui/toast";
import { useWindowDimensions } from "react-native";
import { YStack } from "tamagui";
import { CheckCircle, CheckCircleFill } from "tamagui-phosphor";

const CurrentToast = () => {
  const currentToast = useToastState();
  const { width } = useWindowDimensions();

  if (!currentToast || currentToast.isHandledNatively) return null;

  return (
    <Toast
      key={currentToast.id}
      duration={currentToast.duration ?? 3000}
      enterStyle={{ opacity: 0, y: -25 }}
      exitStyle={{ opacity: 0, y: -25 }}
      y={0}
      left={0}
      right={0}
      opacity={1}
      animation="fast"
      viewportName={currentToast.viewportName}
      borderRadius="$3"
      flexDirection="row"
      ai="center"
      gap="$3"
      bg={currentToast.preset === "error" ? "red" : "$p300"}
      px="$4"
      mx="$3"
      mt="$2"
      minWidth={width * 0.9}
      $gtSm={{
        minWidth: width * 0.6,
      }}
    >
      {currentToast.preset === "error" ? (
        <XCircle size={28} color="white" />
      ) : (
        <CheckCircleFill size={28} color="green" />
      )}
      <YStack>
        <Toast.Title color="$background">{currentToast.title}</Toast.Title>
        {!!currentToast.message && (
          <Toast.Description color="$background">
            {currentToast.message}
          </Toast.Description>
        )}
      </YStack>
    </Toast>
  );
};

export default CurrentToast;
