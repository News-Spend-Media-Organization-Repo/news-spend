import { cn } from "heroui-native";
import { Description } from "heroui-native/description";
import { FieldError } from "heroui-native/field-error";
import { Input } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { TextField } from "heroui-native/text-field";
import { EyeIcon, EyeSlashIcon } from "phosphor-react-native";
import { useState } from "react";
import { Controller, type RegisterOptions, useFormContext } from "react-hook-form";
import { Pressable, View } from "react-native";
import { Icon } from "./icon";

type TextInputProps = {
  isMultiline?: boolean;
  isPassword?: boolean;
  name: string;
  description?: string;
  placeholder: string;
  rules?: RegisterOptions;
  label?: string;
} & React.ComponentPropsWithoutRef<typeof Input>;

export function FormTextInput({
  name,
  placeholder,
  isPassword = false,
  isMultiline = false,
  label,
  description,
  ...rest
}: TextInputProps) {
  const { control } = useFormContext();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState }) => (
        <TextField isInvalid={fieldState.invalid}>
          {isPassword ? null : <Label>{label}</Label>}
          <View className="w-full flex-row items-center">
            <Input
              autoCapitalize="none"
              className={cn(
                "flex-1 rounded-lg border-[oklch(0.90_0.004_286.32)] px-4 android:shadow-none",
                isPassword && "pr-10",
              )}
              multiline={isMultiline}
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder={placeholder}
              secureTextEntry={isPassword && !showPassword}
              value={value}
              {...rest}
            />
            {isPassword && (
              <Pressable
                className="absolute right-3"
                onPress={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <Icon className="text-muted" name={EyeSlashIcon} size={20} />
                ) : (
                  <Icon className="text-muted" name={EyeIcon} size={20} />
                )}
              </Pressable>
            )}
          </View>
          {description && fieldState.invalid && <Description>{description}</Description>}
          {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
        </TextField>
      )}
    />
  );
}

export default FormTextInput;
