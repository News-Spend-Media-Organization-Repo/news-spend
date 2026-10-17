import { Linking } from "react-native";
import { toast } from "#/components/heroui/toast";

const SUPPORT_EMAIL = "support@newsspend.com";

/** Opens the mail app addressed to support, or says where to write if it can't. */
export const contactSupport = async (): Promise<void> => {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  } catch {
    toast.error("Couldn't open your email app", {
      description: `Email us at ${SUPPORT_EMAIL}`,
    });
  }
};
