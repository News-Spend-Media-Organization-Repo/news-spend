import { HeaderHeightContext } from "@react-navigation/elements";
import { useContext } from "react";

/**
 * Whether the screen is rendering underneath a navigator header.
 *
 * Several screens are registered in more than one stack: the settings stack
 * sets `headerShown: true` with its own dark header, while the home, discover
 * and shop stacks set `headerShown: false`. The same component therefore has
 * to behave differently depending on where it was pushed from — it owns its
 * back button, top inset and status-bar style only when no header does.
 *
 * Reads the context directly rather than calling `useHeaderHeight`, which
 * throws when there is no header rather than reporting its absence.
 *
 * Tests the height rather than the context's presence: native-stack provides
 * the context on every screen, reporting 0 where `headerShown` is false, so
 * a presence check reports a header on screens that plainly have none.
 */
export function useHasNavigationHeader(): boolean {
  return (useContext(HeaderHeightContext) ?? 0) > 0;
}
