import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Button, Text, View } from "react-native";
import RNPollfish from "react-native-plugin-pollfish";

function initPollfish(mode) {
  const builder = new RNPollfish.Builder(
    "241a61fd-4e51-4f1d-95af-38fc562ad3cd",
    null
  )
    .rewardMode(true)
    .placementId("test")
    .offerwallMode(true)
    .releaseMode(false);

  // Note: If you are targeting iOS 14+ devices please keep in mind that Pollfish surveys can work
  // with or without the IDFA permission on iOS 14+. If no permission is granted in the ATT popup,
  // the SDK will serve non personalized surveys to the user. In that scenario the conversion is expected to be lower.
  // Offerwall integrations perform better compared to single survey integrations when no IDFA permission is given
  // We recommend requesting IDFA usage permission prior to Pollfish initialization.

  RNPollfish.init(builder.build());
}

function showPollfish() {
  RNPollfish.show();
}

export function SurveyTab() {
  const navigation = useNavigation();
  const route = useRoute();

  const [state, setState] = useState({
    logText: "Pollfish Initialized!",
    isPollfishReady: false,
  });

  const isFocused = useIsFocused();

  const _onFocus = () => {
    console.log("SurveyTab focused");
    initPollfish("Survey");
    setState({
      logText: "Pollfish Initialized!",
      isPollfishReady: false,
    });
  };

  useFocusEffect(
    useCallback(() => {
      _onFocus();
    }, [])
  );

  useEffect(() => {
    RNPollfish.addEventListener(
      RNPollfish.PollfishSurveyReceivedListener,
      (event) => {
        console.log(event);
        if (event === undefined || event === null) {
          setState({
            logText: "Offerwall Received",
            isPollfishReady: true,
          });
        } else {
          setState({
            logText: `Survey Received - CPA: ${event.surveyCPA}, IR: ${event.surveyIR}, LOI: ${event.surveyLOI}, Class: ${event.surveyClass}, Reward Value: ${event.rewardValue}, Reward Name: ${event.rewardName}, Remaining Completes: ${event.remainingCompletes}`,
            isPollfishReady: true,
          });
        }
      }
    );

    // RNPollfish.addEventListener(
    //   RNPollfish.PollfishSurveyCompletedListener,
    //   (event) => {
    //     setState({
    //       logText: `Survey Completed - CPA: IR: ${event.surveyIR}, LOI: ${event.surveyLOI}, Class: ${event.surveyClass}, Reward Value: ${event.rewardValue}, Reward Name: ${event.rewardName}, Remaining Completes: ${event.remainingCompletes}`,
    //       isPollfishReady: false,
    //     });
    //   }
    // );

    // RNPollfish.addEventListener(
    //   RNPollfish.PollfishSurveyNotAvailableListener,
    //   (_) => {
    //     setState({
    //       logText: "Survey Not Available",
    //       isPollfishReady: false,
    //     });
    //   }
    // );

    // RNPollfish.addEventListener(
    //   RNPollfish.PollfishUserNotEligibleListener,
    //   (_) => {
    //     setState({
    //       logText: "User Not Eligible",
    //       isPollfishReady: false,
    //     });
    //   }
    // );

    // RNPollfish.addEventListener(
    //   RNPollfish.PollfishUserRejectedSurveyListener,
    //   (_) => {
    //     setState({
    //       logText: "User Rejected Survey",
    //       isPollfishReady: false,
    //     });
    //   }
    // );

    return () => {
      RNPollfish.removeAllListeners();
    };
  }, []);

  console.log(state);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>{state.logText}</Text>
      {state.isPollfishReady && (
        <Button
          onPress={showPollfish}
          title="Show"
          style={{ display: "none" }}
        />
      )}
    </View>
  );
}
