import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";
import { toast } from "sonner-native";

const OfflineAlert = () => {
  const wasOffline = useRef(false);
  const toastId = useRef<number | string>(0);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!state.isConnected) {
        wasOffline.current = true;
        toastId.current = toast.error(
          "You are offline. Please check your internet connection.",
          {
            duration: Number.POSITIVE_INFINITY,
            dismissible: false,
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
