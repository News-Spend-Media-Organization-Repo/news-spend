import { useMutation } from "@tanstack/react-query";

import { authClient } from "#/lib/authClient";

export const useVerifyOTP = () => {
  return useMutation({
    mutationFn: async ({ email, otp }: { email: string; otp: string }) => {
      return await authClient.emailOtp.verifyEmail({
        email,
        otp,
      });
    },
  });
};

export const useSendOtp = () => {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      return await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
    },
  });
};
