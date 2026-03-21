import { Eye, EyeOff } from "@tamagui/lucide-icons";
import { useState } from "react";
import {
  Controller,
  type RegisterOptions,
  useFormContext,
} from "react-hook-form";
import {
  Input,
  Paragraph,
  TextArea,
  type InputProps as TGInputProps,
  YStack,
} from "tamagui";

import { Button } from "./ui";

type InputProps = TGInputProps & {
  placeholder: string;
  name: string;
  rules?: RegisterOptions;
  isPassword?: boolean;
};

const FormInput = ({ name, placeholder, rules, ...props }: InputProps) => {
  const { control, formState } = useFormContext();
  const [show, setShow] = useState(false);
  const isError = Boolean(formState.errors[name]);

  return (
    <YStack>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => {
          return props.multiline ? (
            <TextArea
              // fontSize="$3"
              {...props}
              borderColor={isError ? "red" : "#E4E3E3"}
              onBlur={onBlur}
              onChangeText={(value) => onChange(value)}
              placeholder={placeholder}
              value={value}
            />
          ) : props.secureTextEntry ? (
            <>
              <Input
                {...props}
                autoCapitalize="none"
                borderColor={isError ? "red" : "#E4E3E3"}
                h={50}
                onBlur={onBlur}
                onChangeText={(value) => onChange(value)}
                placeholder={placeholder}
                // fontSize="$3"
                secureTextEntry={!show}
                value={value}
                placeholderTextColor="black"
              />
              <Button
                bottom={0}
                ghost
                onPress={() => setShow((state) => !state)}
                position="absolute"
                pressStyle={{ backgroundColor: "transparent" }}
                right="$1"
                top={0}
              >
                <Button.Icon color="black">
                  {show ? <EyeOff /> : <Eye />}
                </Button.Icon>
              </Button>
            </>
          ) : (
            <Input
              {...props}
              autoCapitalize="none"
              // fontSize="$3"
              borderColor={isError ? "red" : "#E4E3E3"}
              h={50}
              onBlur={onBlur}
              onChangeText={(value) => onChange(value)}
              placeholder={placeholder}
              value={value}
            />
          );
        }}
      />
      {formState.errors[name] ? (
        <Paragraph color="red" fos="$3" pl="$2">
          {formState.errors[name]?.message}
        </Paragraph>
      ) : null}
    </YStack>
  );
};

export default FormInput;
