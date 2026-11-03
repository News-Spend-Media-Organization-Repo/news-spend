/**
 * Stand-ins for the native modules `linking.tsx` touches, kept out of the
 * `jest.mock` factories: the babel hoist plugin rejects typed code there.
 */
const listeners = new Set<(response: unknown) => void>();

export const notifications = {
  __state: { lastResponse: null as unknown },
  __listeners: listeners,
  getLastNotificationResponse: () => notifications.__state.lastResponse,
  addNotificationResponseReceivedListener: (
    listener: (response: unknown) => void
  ) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
};

const readyListeners = new Set<() => void>();

export const navigationUtils = {
  __state: { ready: true },
  __readyListeners: readyListeners,
  navigationRef: {
    isReady: () => navigationUtils.__state.ready,
    addListener: (_event: "ready", callback: () => void) => {
      readyListeners.add(callback);
      return () => readyListeners.delete(callback);
    },
  },
};
