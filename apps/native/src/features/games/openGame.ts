import { trackDiscover } from "#/lib/discoverAnalyticsClient";
import { navigationRef } from "#/navigation/navigationUtils";

/**
 * Open a game from a Discover list. Goes through the `Game` route, the same
 * one a universal link lands on, so a game started from the list and one
 * started from a link pass the same checks (account, age).
 */
export function openGame(namespace: string, section: "all" | "games") {
  trackDiscover({
    event: "open",
    itemType: "game",
    itemId: namespace,
    section,
  });
  navigationRef.navigate("Game", { namespace, source: section });
}
