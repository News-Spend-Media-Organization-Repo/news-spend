import * as Sentry from "@sentry/react-native";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { currentBuildEnvironment } from "#/utils/buildEnvironment";

export let navigationIntegration: ReturnType<
  typeof Sentry.reactNavigationIntegration
>;

const SSL_HANDSHAKE_RE = /SSLHandshakeException/i;
const API_CONNECT_RE = /Failed to connect to api\.newsspend\.com/i;

/**
 * Transient errors that recover on their own — reporting them as issues is
 * noise:
 * - Worklets race on unmount ("Cannot return shared object..."): a shared
 *   value outlives its JS instance during a Fabric commit (EH/EF). Single
 *   occurrences on low-end devices; nothing to fix in our code.
 * - Corrupt-session decrypt failure ("Invalid batch response" via jose
 *   gcmDecrypt, CJ): the stored session no longer decrypts; the user
 *   re-authenticates and recovers. Seen on old (2.2.0) builds only.
 */
const TRANSIENT_RE = /Cannot return shared object|Invalid batch response/i;

export const initSentry = () => {
  if (__DEV__) {
    return;
  }

  navigationIntegration = Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: true,
  });

  Sentry.init({
    dsn: "https://da31e9a0b06dd748c0616a19b2d3d48e@o4507648362938368.ingest.de.sentry.io/4507648370212944",
    enableLogs: true,
    integrations: [navigationIntegration],
    environment: currentBuildEnvironment(),

    /**
     * Expected flows, not bugs. UPGRADE_REQUIRED already shows the blocking
     * update screen via QueryCache/MutationCache; transient fetch failures
     * already retry and surface through OfflineAlert. Reporting either as an
     * issue is noise (NEWS-SPEND-MEDIA-E0/AJ/DA).
     */
    ignoreErrors: [
      "This version of the app is no longer supported.",
      "UPGRADE_REQUIRED",
      SSL_HANDSHAKE_RE,
      API_CONNECT_RE,
      TRANSIENT_RE,
    ],
    beforeSend(event) {
      const values = event.exception?.values ?? [];
      if (
        values.some((v) =>
          v.value?.includes("This version of the app is no longer supported.")
        )
      ) {
        return null;
      }
      if (values.some((v) => v.value && TRANSIENT_RE.test(v.value))) {
        return null;
      }
      // Simulator / dev-build hangs (AX/AZ/B4): the recent iOS hang events
      // all come from `com.newsspend.app.dev` with `build_type: simulator`.
      // They drown out real-device hangs, so drop simulator events here
      // rather than trusting alert rules to exclude them.
      const contexts = event.contexts as
        | Record<string, Record<string, unknown>>
        | undefined;
      const device = contexts?.device;
      const app = contexts?.app;
      if (device?.simulator === true || app?.build_type === "simulator") {
        return null;
      }
      return event;
    },

    /**
     * Release and dist follow the store conventions Sentry expects: the
     * release is the marketing version, the dist the build number. Without
     * them every issue from every version pools into one, and "did the fix
     * ship?" cannot be answered.
     */
    release: Application.nativeApplicationVersion ?? undefined,
    dist: Application.nativeBuildVersion ?? undefined,
  });

  /**
   * Which JavaScript bundle is actually running.
   *
   * Over-the-air updates mean the binary version does not identify the code:
   * two devices on the same build can be running different JS. `updateId` is
   * the only thing that says which, and a stack trace against the wrong bundle
   * is a stack trace against the wrong line numbers.
   *
   * `embedded` when no update has been applied, so the tag is never absent.
   */
  Sentry.setTag("update_id", Updates.updateId ?? "embedded");
  Sentry.setTag("update_channel", Updates.channel ?? "embedded");
};
