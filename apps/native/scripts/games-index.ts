/**
 * Prints the index of games Apple asks for under Guideline 4.7.4: one row per
 * game with its universal link. Run with `bun run games:index > index.csv` and
 * attach the file to the Review Notes of every submission that changes the list.
 */
import { GAMES, gameLink, gamePlayUrl } from "../src/features/games/catalog";

const cell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const rows = [
  ["title", "developer_or_publisher", "universal_link", "play_url", "category"],
  ...GAMES.map((game) => [
    game.title,
    "GamePix (distributor)",
    gameLink(game.namespace),
    gamePlayUrl(game.namespace),
    game.category,
  ]),
];

console.log(rows.map((row) => row.map(cell).join(",")).join("\n"));
