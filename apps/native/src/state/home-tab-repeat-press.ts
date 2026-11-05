/**
 * Pressing the Home tab while already on it.
 *
 * The tab navigator uses the native implementation, where a repeated press is
 * handled by react-native-screens: it scrolls the first scroll view its
 * heuristic finds, which on Home is the category strip or the pager, not the
 * feed. (Pointing it at the right one needs `ScrollViewMarker`, which is still
 * behind the experimental "gamma" build flag.) So the Home tab's `tabPress`
 * listener emits here and the home screen scrolls its active feed itself.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onHomeTabRepeatPress(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitHomeTabRepeatPress(): void {
  for (const listener of listeners) {
    listener();
  }
}
