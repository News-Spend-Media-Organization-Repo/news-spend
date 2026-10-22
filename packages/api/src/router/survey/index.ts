import { sendNotification } from "@news-spend-media/payload/lib/send-notification";
import {
  DEFAULT_SURVEY_POINTS,
  MAX_SURVEY_POINTS,
} from "@news-spend-media/payload/lib/surveyPoints";
import { openapi } from "@orpc/openapi";
import z from "zod";

import { protectedProcedure } from "../../index";
import { withKeyedLock } from "../../lib/keyedLock";
import { addActivity } from "../../shared/activity";
import { cpxRouter } from "./cpx";
import {
  offersRouter,
  rapidoPostbackHandler,
  theoremPostbackHandler,
} from "./offers";
import { bitlabsPostbackHandler } from "./offers/bitlabsPostback";
import { AwardGoogleFormInputSchema } from "./schemas";

const awardGoogleFormPoints = protectedProcedure
  .meta(
    openapi({
      method: "POST",
      path: "/survey/gFormAwardPoint",
      summary: "Award point for google forms",
      tags: ["survey"],
    })
  )
  .input(AwardGoogleFormInputSchema)
  .output(z.any())
  .handler(async ({ input, context, errors }) => {
    try {
      const { gFormId } = input;
      const { payload } = context;
      // Always the signed-in user. A userId in the request is never trusted:
      // it would let a caller choose which "already completed" list to be
      // checked against while being paid on their own account.
      const userId = context.user.id;

      // One request at a time per user and form, so two arriving together
      // cannot both find the survey not yet completed.
      return await withKeyedLock(`${gFormId}:${userId}`, async () => {
        const gForm = await payload.find({
          collection: "survey",
          where: {
            googleFormId: {
              equals: gFormId,
            },
          },
          depth: 0,
        });

        const survey = gForm.docs[0];

        if (!survey) {
          throw errors.NOT_FOUND({
            message: "Survey not found",
          });
        }

        // Ids, whether the relationship came back as ids or as documents.
        const completedBy = (survey.users ?? []).map((user) =>
          typeof user === "string" ? user : user.id
        );
        if (completedBy.includes(userId)) {
          return survey;
        }

        const points = survey.points ?? DEFAULT_SURVEY_POINTS;
        if (
          typeof points !== "number" ||
          !Number.isFinite(points) ||
          points <= 0 ||
          points > MAX_SURVEY_POINTS
        ) {
          console.error(
            `Refusing to award survey ${survey.id}: points ${String(points)} is outside 1-${MAX_SURVEY_POINTS}`
          );
          throw errors.BAD_REQUEST({
            message: "This survey cannot award points",
          });
        }

        const res = await payload.update({
          collection: "survey",
          id: survey.id,
          data: {
            users: [...completedBy, userId],
          },
        });

        await addActivity(
          {
            type: "point",
            point: points,
            description: "Awarded for completing survey",
            action: "surveyTask",
          },
          context
        );

        const pushTokens = await payload.find({
          collection: "push-tokens",
          where: {
            user: {
              equals: userId,
            },
          },
          pagination: false,
        });

        await sendNotification({
          pushTokens: pushTokens.docs,
          title: "Point awarded",
          body: `You have been awarded ${points} points for completing a survey`,
          data: {
            surveyId: gFormId,
            type: "survey",
            url: "settings/activities",
          },
        });

        return res;
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  });

const getAllSurveys = protectedProcedure.handler(async ({ context }) => {
  const { payload, user } = context;

  const surveys = await payload.find({
    collection: "survey",
    where: {
      ...(user ? { users: { not_in: [user.id] } } : {}),
    },
  });

  return surveys;
});

export const surveyRouter = {
  awardGoogleFormPoints,
  getAll: getAllSurveys,
  cpx: cpxRouter,
  offers: offersRouter,
  rapidoPostback: rapidoPostbackHandler,
  theoremPostback: theoremPostbackHandler,
  bitlabsPostback: bitlabsPostbackHandler,
};
