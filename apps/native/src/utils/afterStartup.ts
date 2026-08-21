import { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/**
 * Startup work that isn't first-paint work.
 *
 * Analytics, widget scheduling, ad SDK init and the like all used to fire in
 * the same tick as the first render. None of them are needed for the user to
 * see and touch the app, but all of them run on the JS thread, so they land
 * squarely on the frames where the first screen is trying to mount — the app
 * appears, then stutters.
 *
 * `runAfterInteractions` waits for the in-flight interactions (the navigator
 * mounting, the splash fading) to finish before running the callback. The
 * extra timeout hop past it yields one more frame, so the first screen gets to
 * present before background work starts competing for the thread.
 */
const STARTUP_SETTLE_MS = 350;

export function runAfterStartup(task: () => void): () => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const handle = InteractionManager.runAfterInteractions(() => {
    timeout = setTimeout(task, STARTUP_SETTLE_MS);
  });

  return () => {
    handle.cancel();
    if (timeout) {
      clearTimeout(timeout);
    }
  };
}

/**
 * Flips to `true` once startup has settled, for gating effects that would
 * otherwise run during first paint.
 *
 * Returning a flag rather than taking a callback keeps the deferral compatible
 * with hooks, which cannot be called conditionally: the hook runs on every
 * render as usual, and only the work inside it waits.
 */
export function useAfterStartup(): boolean {
  const [settled, setSettled] = useState(false);

  useEffect(() => runAfterStartup(() => setSettled(true)), []);

  return settled;
}
