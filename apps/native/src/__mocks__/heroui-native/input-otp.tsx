import { TextInput, View } from "react-native";

export const REGEXP_ONLY_DIGITS = "^\\d+$";

/** One text input for the whole code, as the real component has. */
export function InputOTP({ children, maxLength, onChange, value }: any) {
  return (
    <View>
      <TextInput
        maxLength={maxLength}
        onChangeText={onChange}
        testID="otp-input"
        value={value}
      />
      {children}
    </View>
  );
}

InputOTP.Group = function InputOTPGroup({ children }: any) {
  return <View>{children}</View>;
};

InputOTP.Slot = function InputOTPSlot({ index }: any) {
  return <View testID={`otp-slot-${index}`} />;
};
