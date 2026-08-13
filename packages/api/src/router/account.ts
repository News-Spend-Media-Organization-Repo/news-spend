import { auth } from "@news-spend-media/auth";
import { openapi } from "@orpc/openapi";
import z from "zod";

import { protectedNoGuestProcedure, protectedProcedure } from "..";

const changePassword = protectedNoGuestProcedure
  .input(
    z.object({
      oldPassword: z.string().min(6).max(100),
      newPassword: z.string().min(6).max(100),
    })
  )
  .handler(async ({ input, context, errors }) => {
    const { user, payload } = context;
    const { oldPassword, newPassword } = input;

    const userCheck = await payload.findByID({
      collection: "users",
      id: user.id,
    });

    if (!userCheck) {
      throw errors.NOT_FOUND({
        message: "User not found",
      });
    }

    return {
      success: true,
      message: "Password changed successfully",
    };
  });

const updateProfile = protectedNoGuestProcedure
  .input(
    z
      .object({
        username: z.string().min(3).max(30),
        name: z.string().optional(),
        phone: z.string().optional(),
      })
      .catchall(z.any())
  )
  .handler(async ({ input, context, errors }) => {
    const {
      payload,
      user: { id: userId },
    } = context;
    const customErr: z.core.$ZodIssue[] = [];

    const { username, ...rest } = input;

    const user = await payload.findByID({
      collection: "users",
      id: userId,
    });

    if (!user) {
      throw errors.NOT_FOUND({
        message: "User not found",
      });
    }

    const usernameExist = await payload.count({
      collection: "users",
      where: {
        username: {
          equals: username,
        },
        id: {
          not_in: [userId],
        },
      },
    });

    if (usernameExist.totalDocs > 0) {
      customErr.push({
        code: "custom",
        path: ["username"],
        message: "Username already exists",
      });
    }

    const zodError = new z.ZodError(customErr);

    if (customErr.length > 0) {
      throw errors.INPUT_VALIDATION_FAILED({
        message: "Invalid input",
        cause: zodError,
        data: z.flattenError(zodError),
      });
    }

    // const nameFormatted = input.name
    //   ?.split(" ")
    //   .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    //   .join(" ");

    console.log(input.name);

    const userUpdate = await auth.api.updateUser({
      headers: context.headers,
      body: {
        ...rest,
        name: input.name,
        ...(user?.username?.toLowerCase().trim() ===
        username?.toLowerCase().trim()
          ? {}
          : { username }),
      },
    });

    return userUpdate;
  });

const createPushToken = protectedProcedure
  .input(
    z.object({
      token: z.string(),
      deviceType: z.enum(["ios", "android", "web"]),
      deviceModel: z.string().optional(),
      deviceName: z.string().optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const { payload, user } = context;
    const { token, deviceType, deviceModel, deviceName } = input;

    const pushToken = await payload.find({
      collection: "push-tokens",
      where: {
        token: {
          equals: token,
        },
      },
      limit: 1,
    });

    if (pushToken.totalDocs > 0) {
      return await payload.update({
        collection: "push-tokens",
        where: {
          token: {
            equals: token,
          },
        },
        data: {
          user: user.id,
          deviceType,
          status: "active",
          appVersion: "",
          deviceModel,
          deviceName,
        },
      });
    }
    return await payload.create({
      collection: "push-tokens",
      data: {
        token,
        user: user.id,
        deviceType,
        status: "active",
        appVersion: "",
        deviceModel,
        deviceName,
      },
    });
  });

const deletePushToken = protectedProcedure
  .meta(
    openapi({
      method: "POST",
      path: "/account/delete-push-token",
      summary: "Delete push token",
      tags: ["account"],
    })
  )
  .input(
    z.object({
      token: z.string().optional(),
    })
  )
  .handler(async ({ input, context }) => {
    const { payload } = context;
    await payload.delete({
      collection: "push-tokens",
      where: {
        token: {
          equals: input.token,
        },
      },
    });

    return {
      success: true,
      message: "Push token deleted",
    };
  });

const me = protectedProcedure.handler(async ({ context, errors }) => {
  const {
    payload,
    user: { id: userId },
  } = context;
  const user = await payload.findByID({
    collection: "users",
    id: userId,
  });

  if (!user) {
    throw errors.NOT_FOUND({
      message: "User not found",
    });
  }

  return user;
});

export const accountRouter = {
  updateProfile,
  changePassword,
  createPushToken,
  deletePushToken,
  me,
};
