import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";

import { toast } from "#/components/heroui/toast";
import useAddActivity from "#/hooks/point/useAddActivity";
import { playerState } from "#/state/audioPlayerState";

export const useListeningTimeSync = () => {
  const { listeningTime, pointEarnedToday } = useSnapshot(playerState);
  const addActivityMutation = useAddActivity();
  const hasMutatedRef = useRef(false);

  useEffect(() => {
    if (listeningTime >= 1800 && !hasMutatedRef.current && !pointEarnedToday) {
      hasMutatedRef.current = true;
      addActivityMutation.mutate(
        {
          action: "musicListeningTime",
          point: 40,
          type: "point",
          description: "Listening to music for 30 minutes",
        },
        {
          onSuccess: (data) => {
            playerState.pointEarnedToday = true;
            if ("message" in data && data.message === "ALREADY_EXISTS") {
              return;
            }
            toast.success(
              "You've earned 40 points for listening to music for 30 minutes!"
            );
          },
          onError: (error) => {
            console.error("Error adding activity:", error);
          },
        }
      );
    }

    return () => {
      hasMutatedRef.current = false;
    };
  }, [listeningTime, pointEarnedToday, addActivityMutation.mutate]);

  return addActivityMutation;
};
