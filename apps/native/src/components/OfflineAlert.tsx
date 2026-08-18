import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";
import { toast } from "#/components/heroui/toast";

const OfflineAlert = () => {
  const wasOffline = useRef(false);
  const toastId = useRef("");

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!state.isConnected) {
        wasOffline.current = true;
        toastId.current = toast.error(
          "You are offline. Please check your internet connection.",
          {
            duration: Number.POSITIVE_INFINITY,
            isSwipeable: false,
          }
        );
      } else if (wasOffline.current) {
        toast.success("You are back online.", {
          duration: 2000,
          id: toastId.current,
        });
        wasOffline.current = false;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return null;
};

export default OfflineAlert;
