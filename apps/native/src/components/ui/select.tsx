import { Check, ChevronDown, ChevronUp } from "@tamagui/lucide-icons";
import React from "react";
import {
  Adapt,
  ScrollView,
  type SelectProps,
  Sheet,
  type SnapPointsMode,
  Select as TamaguiSelect,
  YStack,
} from "tamagui";

import { useGlobalBackHandler } from "#/hooks/useBackHandler";
import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

interface Props extends SelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options: {
    title: string;
    value: string;
  }[];
  snapPoints?: (string | number)[];
  snapPointsMode?: SnapPointsMode;
}

export default function Select(props: Props) {
  const insets = useSafeAreaInsetsStyle(["bottom"], "padding");
  const [open, setOpen] = React.useState(false);
  const { value, onChange, options, snapPoints, snapPointsMode, ...rest } =
    props;

  useGlobalBackHandler(() => {
    if (open) {
      setOpen(false);
      return true;
    }
    return false;
  });

  return (
    <TamaguiSelect
      disablePreventBodyScroll
      onOpenChange={setOpen}
      onValueChange={onChange}
      open={open}
      value={value}
      {...rest}
    >
      <TamaguiSelect.Trigger iconAfter={ChevronDown}>
        <TamaguiSelect.Value
          flex={1}
          placeholder={props.placeholder || "Select an option"}
        />
      </TamaguiSelect.Trigger>

      <Adapt platform="touch" when="sm">
        <Sheet
          animation="easeIn"
          dismissOnSnapToBottom
          forceRemoveScrollEnabled
          modal
          snapPointsMode={snapPointsMode ?? "fit"}
          {...(snapPoints ? { snapPoints } : {})}
        >
          <Sheet.Frame style={insets}>
            <ScrollView>
              <Adapt.Contents />
            </ScrollView>
          </Sheet.Frame>
          <Sheet.Overlay
            animation="medium"
            bg="rgba(0,0,0,0.5)"
            enterStyle={{ opacity: 0 }}
            exitStyle={{ opacity: 0 }}
          />
        </Sheet>
      </Adapt>

      <TamaguiSelect.Content zIndex={200_000}>
        <TamaguiSelect.ScrollUpButton
          alignItems="center"
          height="$3"
          justifyContent="center"
          position="relative"
          width="100%"
        >
          <YStack zIndex={10}>
            <ChevronUp size={20} />
          </YStack>
        </TamaguiSelect.ScrollUpButton>

        <TamaguiSelect.Viewport minWidth={200}>
          <TamaguiSelect.Group>
            <TamaguiSelect.Label>
              {props.placeholder || "Select an option"}
            </TamaguiSelect.Label>
            {React.useMemo(
              () =>
                options.map((item, i) => (
                  <TamaguiSelect.Item
                    bg={value === item.value ? "#f5f5f5" : "transparent"}
                    index={i}
                    key={item.value}
                    value={item.value}
                  >
                    <TamaguiSelect.ItemText>
                      {item.title}
                    </TamaguiSelect.ItemText>
                    <TamaguiSelect.ItemIndicator marginLeft="auto">
                      <Check size={16} />
                    </TamaguiSelect.ItemIndicator>
                  </TamaguiSelect.Item>
                )),
              [options, value]
            )}
          </TamaguiSelect.Group>
        </TamaguiSelect.Viewport>

        <TamaguiSelect.ScrollDownButton
          alignItems="center"
          height="$3"
          justifyContent="center"
          position="relative"
          width="100%"
        >
          <YStack zIndex={10}>
            <ChevronDown size={20} />
          </YStack>
        </TamaguiSelect.ScrollDownButton>
      </TamaguiSelect.Content>
    </TamaguiSelect>
  );
}
