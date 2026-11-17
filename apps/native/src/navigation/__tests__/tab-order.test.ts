import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCREEN_BLOCK_PATTERN =
  /screens:\s*\{([\s\S]*?)^\s{2}\},\s*screenOptions:/m;
const SCREEN_NAME_PATTERN = /^\s{4}([A-Za-z][A-Za-z0-9]*): \{/gm;

it("keeps the actual tab screen definitions in the requested order", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "navigation", "tab-navigator.tsx"),
    "utf8"
  );
  const screensBlock = source.match(SCREEN_BLOCK_PATTERN)?.[1];
  expect(screensBlock).toBeDefined();

  const screenNames = Array.from(
    screensBlock?.matchAll(SCREEN_NAME_PATTERN) ?? [],
    (match) => match[1]
  );
  expect(screenNames).toEqual([
    "Home",
    "Live",
    "ForYou",
    "Discover",
    "More",
  ]);
});
