import {
  type ResolvedSurveySettings,
  resolveSurveySettings,
  type SurveySettingsDoc,
} from "@news-spend-media/payload/lib/surveySettings";
import type { BasePayload } from "payload";

/**
 * The last successfully read settings. A failed read must not flip a staff
 * kill-switch or blank the survey tab, so this outlives the request.
 */
let lastGood: ResolvedSurveySettings | null = null;

export function resetSurveySettingsCache(): void {
  lastGood = null;
}

export async function readSurveySettings(
  payload: BasePayload
): Promise<ResolvedSurveySettings> {
  try {
    const doc = (await payload.findGlobal({
      slug: "survey-settings",
      depth: 0,
    })) as SurveySettingsDoc | null;
    lastGood = resolveSurveySettings(doc);
    return lastGood;
  } catch (error) {
    console.error(
      "Could not read survey settings, using the last known values:",
      error
    );
    return lastGood ?? resolveSurveySettings(null);
  }
}
