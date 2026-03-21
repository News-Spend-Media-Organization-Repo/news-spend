import { useToastController } from "@tamagui/toast";
import { useEffect } from "react";

export function useToast() {
  const toast = useToastController();

  useEffect(() => {
    return toast.hide;
  }, []);

  return toast;
}
