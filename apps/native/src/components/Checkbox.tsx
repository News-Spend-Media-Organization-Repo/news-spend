import { Check } from "@tamagui/lucide-icons";
import { useState } from "react";
import { XStack, type XStackProps } from "tamagui";

export function Checkbox(
  props: XStackProps & {
    value: boolean;
    onChange: (e: boolean) => any;
  }
) {
  const [isChecked, setChecked] = useState<boolean>(!!props.value);
  const { value, onChange, ...rest } = props;
  const toggle = () => {
    let val;
    setChecked((prevState) => {
      val = !prevState;
      return !prevState;
    });
    if (typeof onChange === "function") {
      onChange(!!val);
    }
  };

  return (
    <XStack
      ai="center"
      bg={isChecked ? "#2C98F0" : "transparent"}
      boc={isChecked ? "#2C98F0" : "gray"}
      bw={isChecked ? 0 : 1}
      h={15}
      jc="center"
      onPress={toggle}
      w={15}
      {...rest}
    >
      {isChecked && <Check color="white" size={15} />}
    </XStack>
  );
}
