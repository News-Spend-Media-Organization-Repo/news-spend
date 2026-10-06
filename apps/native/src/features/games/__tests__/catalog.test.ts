import {
  findGame,
  GAMES,
  GAMES_MIN_AGE,
  gameLink,
  gamePlayUrl,
} from "../catalog";

describe("games catalog", () => {
  it("lists thirty games, each once", () => {
    expect(GAMES).toHaveLength(30);
    expect(new Set(GAMES.map((g) => g.namespace)).size).toBe(GAMES.length);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
  });

  it("gives every game what the list and the index need", () => {
    for (const game of GAMES) {
      expect(game.namespace).toMatch(/^[a-z0-9-]+$/);
      expect(game.title.length).toBeGreaterThan(0);
      expect(game.description.length).toBeGreaterThan(0);
      expect(game.image).toMatch(/^https:\/\/img\.gamepix\.com\//);
    }
  });

  it("builds the play address and universal link from the namespace", () => {
    expect(gamePlayUrl("prism-match-3d")).toBe(
      "https://play.gamepix.com/prism-match-3d/embed?sid=SW281"
    );
    expect(gameLink("prism-match-3d")).toBe(
      "https://link.newsspend.com/games/prism-match-3d"
    );
  });

  it("opens only games on the list", () => {
    expect(findGame("prism-match-3d")?.title).toBe("Prism Match 3D");
    expect(findGame("not-a-game")).toBeUndefined();
    expect(findGame(undefined)).toBeUndefined();
    // A link cannot be made to point the in-app browser somewhere else.
    expect(findGame("../../evil")).toBeUndefined();
  });

  it("limits games to the age the app is rated for", () => {
    expect(GAMES_MIN_AGE).toBe(16);
  });
});
