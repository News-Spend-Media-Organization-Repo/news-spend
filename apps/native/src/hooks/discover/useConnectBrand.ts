import { useNavigation } from "@react-navigation/native";
import { useMMKVObject } from "react-native-mmkv";

import { toast } from "#/components/heroui/toast";
import useAddActivity from "#/hooks/point/useAddActivity";
import { authState } from "#/state/auth";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_REWARDED_COUNT = 8;
const LUCKY_WALL_EVERY_N = 4;
const STORAGE_KEY = "CONNECT_BRAND_COUNT_DATA";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectBrandData = { count: number; date: string };

const today = () => new Date().toDateString();

// ─── Hook ─────────────────────────────────────────────────────────────────────

type UseConnectBrandReturn = {
  /** Call before opening the dialog. Returns false if dialog should not open. */
  onOpen: () => boolean;
  /** Call when the ad countdown completes and the user earned a reward. */
  onCountdownComplete: () => void;
  /** Whether the user can still earn points today. */
  canEarnPoints: boolean;
};

export function useConnectBrand(): UseConnectBrandReturn {
  const navigation = useNavigation();
  const addActivityMutation = useAddActivity({
    onCapReached: () => {
      setData({ count: MAX_REWARDED_COUNT, date: today() });
    },
  });
  const [data, setData] = useMMKVObject<ConnectBrandData>(STORAGE_KEY);

  const count = data?.date === today() ? data.count : 0;
  const canEarnPoints = count < MAX_REWARDED_COUNT;

  const increment = () => {
    setData((prev) => ({
      // A new day starts from zero. Using yesterday's count let a maxed day
      // carry 9 into today, which made canEarnPoints false after one ad.
      count: (prev?.date === today() ? (prev?.count ?? 0) : 0) + 1,
      date: today(),
    }));
  };

  const onOpen = (): boolean => {
    if (!authState.user) {
      return false;
    }

    if (!canEarnPoints) {
      // Still opens: the advertisement can be watched, it just cannot pay
      // again today. Say so before the fifteen seconds rather than after.
      toast.error("Daily limit reached. Points resume tomorrow.");
    } else if (count % LUCKY_WALL_EVERY_N === LUCKY_WALL_EVERY_N - 1) {
      increment();
      navigation.navigate("LuckyAppWall");
      return false;
    }

    return true;
  };

  const onCountdownComplete = () => {
    if (!(canEarnPoints && authState.user)) {
      return;
    }

    addActivityMutation.mutate(
      {
        action: "connectBrandAd",
      },
      {
        onSuccess: (response) => {
          if (response?.message === "CAP_REACHED") {
            toast.error("Daily limit reached. Try again tomorrow!");
            return;
          }
          increment();
          toast.success(`You earned ${response?.pointsAwarded ?? 0} points!`, {
            description: "You can earn more points by connecting more brands",
          });
        },
      }
    );
  };

  return { onOpen, onCountdownComplete, canEarnPoints };
}
