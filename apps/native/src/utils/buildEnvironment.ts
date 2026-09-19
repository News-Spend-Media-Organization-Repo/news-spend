import Constants from "expo-constants";
import * as Updates from "expo-updates";

export type BuildEnvironment =
  | "production"
  | "staging"
  | "development"
  | "unknown";

/**
 * Which build this is, from the release channel when there is one.
 *
 * `extra.variant` comes from APP_VARIANT, which lives in each build profile in
 * eas.json and is not an EAS environment variable. An update replaces
 * `Constants.expoConfig` wholesale with whatever config the machine running
 * `eas update` produced, so the variant an updated build reports is that
 * machine's: `development` from a local .env, or nothing at all. The update
 * channel is fixed by the installed binary and cannot be rewritten by an
 * update, which is why ad units already trust it and why this does too.
 *
 * The channel is null in Expo Go and in a locally-run dev client, so the
 * variant stays as the fallback there.
 *
 * "preview" and "beta" are the builds pointed at staging, reported as
 * `staging`: the question an issue asks is which backend it hit, not how the
 * binary was distributed.
 */
export function resolveBuildEnvironment(
  channel: string | null | undefined,
  variant: string | undefined
): BuildEnvironment {
  switch (channel ?? variant) {
    case "production":
      return "production";
    case "preview":
    case "beta":
      return "staging";
    case "development":
      return "development";
    default:
      // Better an honest unknown than a wrong guess: an issue tagged
      // "production" that is not production is worse than one tagged nothing.
      return "unknown";
  }
}

export function currentBuildEnvironment(): BuildEnvironment {
  return resolveBuildEnvironment(
    Updates.channel,
    Constants.expoConfig?.extra?.variant as string | undefined
  );
}
