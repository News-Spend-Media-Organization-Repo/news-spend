/**
 * The games offered in the app, and the only ones it will open.
 *
 * Apple's Guideline 4.7 lets an app offer HTML5 games that are not in the
 * binary, but makes the app responsible for every one of them and requires an
 * index of them with a universal link for each (4.7.4). A fixed, reviewed list
 * is what makes that possible: the index is exactly this array, and a link to
 * anything else (a game removed from here, a name made up in a URL) opens
 * nothing.
 *
 * Games are supplied by GamePix (publisher ID SW281) and run in the in-app
 * browser from play.gamepix.com. To add or remove one, change this array and
 * send an updated index with the next submission: `bun run games:index`.
 *
 * Chosen for an app rated 16+: no violence, gambling themes, alcohol, horror or
 * children's content, and nothing with online play against strangers, so no
 * chat to moderate and no one to block.
 */
export type Game = {
  /** The game's slug on GamePix. Also the last segment of its universal link. */
  namespace: string;
  /** GamePix's id for the game. */
  id: string;
  title: string;
  category: string;
  description: string;
  image: string;
};

/**
 * The lowest age the app is rated for in most regions. Games are limited to
 * people at least this old (Guideline 4.7.5), by the age they declared.
 */
export const GAMES_MIN_AGE = 16;

export const GAMES: readonly Game[] = [
  {
    namespace: "prism-match-3d",
    id: "737HCH",
    title: "Prism Match 3D",
    category: "match-3",
    description:
      "Dive into a mesmerizing 3D cube universe where vibrant prisms challenge your logic and timing. Rotate and explore intricately designed levels while relaxing your mind…",
    image:
      "https://img.gamepix.com/games/prism-match-3d/icon/prism-match-3d.png?w=160",
  },
  {
    namespace: "match-mystery",
    id: "6CTE0",
    title: "Match Mystery",
    category: "match-3",
    description:
      "Immerse yourself in Match Mystery, a match-3 puzzle adventure with endless challenges and a captivating storyline. Dive into stunning visuals, where each strategic move…",
    image:
      "https://img.gamepix.com/games/match-mystery/icon/match-mystery.png?w=160",
  },
  {
    namespace: "candy-match-saga-2",
    id: "5H4523",
    title: "Candy Match Saga 2",
    category: "match-3",
    description:
      "Embark on a vibrant candy-filled adventure with Candy Match Saga 2. Swap and match colorful candies to solve captivating puzzles, tackle delightful obstacles, and unlock…",
    image:
      "https://img.gamepix.com/games/candy-match-saga-2/icon/candy-match-saga-2.png?w=160",
  },
  {
    namespace: "drop-planets",
    id: "401685",
    title: "Drop Planets",
    category: "puzzle",
    description: "A relaxing puzzle game. Take your time and solve each level.",
    image:
      "https://img.gamepix.com/games/drop-planets/icon/drop-planets.png?w=160",
  },
  {
    namespace: "gravity-merge",
    id: "98373R",
    title: "Gravity Merge",
    category: "puzzle",
    description: "A relaxing puzzle game. Take your time and solve each level.",
    image:
      "https://img.gamepix.com/games/gravity-merge/icon/gravity-merge.png?w=160",
  },
  {
    namespace: "seat-the-guests",
    id: "H54UGT",
    title: "Seat the Guests",
    category: "puzzle",
    description: "A relaxing puzzle game. Take your time and solve each level.",
    image:
      "https://img.gamepix.com/games/seat-the-guests/icon/seat-the-guests.png?w=160",
  },
  {
    namespace: "robot-band-find-the-differences",
    id: "NBREF",
    title: "Robot Band - Find the differences",
    category: "puzzle",
    description:
      "Enter a whimsical world of musical robots in Robot Band - Find the Differences. Test your observation skills as you uncover subtle discrepancies in images. Progress…",
    image:
      "https://img.gamepix.com/games/robot-band-find-the-differences/icon/robot-band-find-the-differences.png?w=160",
  },
  {
    namespace: "puzzlebot",
    id: "B6Z89",
    title: "Puzzlebot",
    category: "puzzle",
    description:
      "Dive into Puzzlebot, where seven unique jigsaw puzzles await your mastery. Tackle diverse challenges across three difficulty tiers, with stunning images to reveal. Beat…",
    image: "https://img.gamepix.com/games/puzzlebot/icon/puzzlebot.png?w=160",
  },
  {
    namespace: "world-cup-flag-match",
    id: "119H7",
    title: "World Cup Flag Match",
    category: "puzzle",
    description:
      "Challenge your world knowledge and puzzle skills in World Cup Flag Match. Swap flags to match three in a row, advancing through levels that test your strategy and global…",
    image:
      "https://img.gamepix.com/games/world-cup-flag-match/icon/world-cup-flag-match.png?w=160",
  },
  {
    namespace: "jigsaw-sort",
    id: "04WSSW",
    title: "Jigsaw Sort",
    category: "jigsaw-puzzles",
    description:
      "Challenge your wits with Jigsaw Sort, a captivating puzzle game where you swap pieces to unveil hidden images. Progressively complex levels offer endless fun and fresh…",
    image:
      "https://img.gamepix.com/games/jigsaw-sort/icon/jigsaw-sort.png?w=160",
  },
  {
    namespace: "merge-royal",
    id: "047891",
    title: "Merge Royal",
    category: "2048",
    description:
      "Dive into Merge Royal, where Solitaire strategy meets 2048 thrill. Effortlessly merge matching cards, aiming for higher numbers while unlocking dazzling visuals. Perfect…",
    image:
      "https://img.gamepix.com/games/merge-royal/icon/merge-royal.png?w=160",
  },
  {
    namespace: "2048",
    id: "1",
    title: "2048",
    category: "math",
    description:
      "Slide and strategize your way to victory in 2048, a deceptively simple yet deeply engaging puzzle. Merge matching tiles on a compact grid to climb to the coveted 2048…",
    image: "https://img.gamepix.com/games/2048/icon/2048.png?w=160",
  },
  {
    namespace: "2048-x2-merge-blocks",
    id: "5R4XE",
    title: "2048 X2 Merge Blocks",
    category: "2048",
    description:
      "Immerse yourself in the captivating fusion of strategy and puzzle-solving with 2048 X2 Merge Blocks. Navigate falling numerical blocks, strategically align them to merge…",
    image:
      "https://img.gamepix.com/games/2048-x2-merge-blocks/icon/2048-x2-merge-blocks.png?w=160",
  },
  {
    namespace: "flag-memory-match",
    id: "9211YC",
    title: "Flag Memory Match",
    category: "memory",
    description:
      "Test your memory with Flag Memory Match, a vibrant educational challenge featuring flags from 98 countries. Flip cards to find matching pairs, earn points, and unlock…",
    image:
      "https://img.gamepix.com/games/flag-memory-match/icon/flag-memory-match.png?w=160",
  },
  {
    namespace: "memory-cards",
    id: "68RO08",
    title: "Memory Cards",
    category: "memory",
    description:
      "Test your memory and cognitive skills with Memory Cards! Sequence through increasingly challenging levels by identifying and selecting cards in the correct order…",
    image:
      "https://img.gamepix.com/games/memory-cards/icon/memory-cards.png?w=160",
  },
  {
    namespace: "kobadoo-numbers",
    id: "3R166",
    title: "Kobadoo Numbers",
    category: "memory",
    description:
      "Strengthen your mind with Kobadoo Numbers, a captivating browser game. Challenge yourself to memorize increasingly difficult two-digit sequences and enhance your…",
    image:
      "https://img.gamepix.com/games/kobadoo-numbers/icon/kobadoo-numbers.png?w=160",
  },
  {
    namespace: "kobadoo-emojis",
    id: "M46I6",
    title: "Kobadoo Emojis",
    category: "trivia",
    description:
      "Kobadoo Emojis invites you into a delightful memory challenge with amusing emojis to sequence. As you advance, the complexity grows, enhancing your cognitive skills…",
    image:
      "https://img.gamepix.com/games/kobadoo-emojis/icon/kobadoo-emojis.png?w=160",
  },
  {
    namespace: "kobadoo-shapes",
    id: "S5498",
    title: "Kobadoo Shapes",
    category: "trivia",
    description:
      "Kobadoo Shapes challenges you to memorize and replicate sequences of vibrant shapes, enhancing your memory while delivering a rewarding mental workout. With its…",
    image:
      "https://img.gamepix.com/games/kobadoo-shapes/icon/kobadoo-shapes.png?w=160",
  },
  {
    namespace: "kobadoo-flags",
    id: "24A7L",
    title: "Kobadoo Flags",
    category: "trivia",
    description:
      "Test your flag knowledge with Kobadoo Flags, an addictive game that sharpens memory and boosts cognitive skills. Memorize flags as challenges intensify, making it both…",
    image:
      "https://img.gamepix.com/games/kobadoo-flags/icon/kobadoo-flags.png?w=160",
  },
  {
    namespace: "kobadoo-arithmetic",
    id: "60II0",
    title: "Kobadoo Arithmetic",
    category: "math",
    description:
      "Sharpen your mind with Kobadoo Arithmetic, a captivating number challenge that enhances math skills and memory. Memorize sequences, calculate sums, and tackle…",
    image:
      "https://img.gamepix.com/games/kobadoo-arithmetic/icon/kobadoo-arithmetic.png?w=160",
  },
  {
    namespace: "super-chains",
    id: "2NP74",
    title: "Super Chains",
    category: "math",
    description:
      "Super Chains invites you into a mesmerizing puzzle universe where you connect blocks of ascending, descending, or matching numbers to unveil mystical creatures. Master…",
    image:
      "https://img.gamepix.com/games/super-chains/icon/super-chains.png?w=160",
  },
  {
    namespace: "lipuzz-water-sort-puzzle",
    id: "2PI32",
    title: "Lipuzz - Water Sort Puzzle",
    category: "brain",
    description:
      "Lipuzz invites you to master the art of liquid organization in a delightful puzzle challenge. Strategically pour and match colorful liquids into containers while…",
    image:
      "https://img.gamepix.com/games/lipuzz-water-sort-puzzle/icon/lipuzz-water-sort-puzzle.png?w=160",
  },
  {
    namespace: "flow-mania",
    id: "40312",
    title: "Flow Mania",
    category: "brain",
    description:
      "Dive into Flow Mania, a delightfully addictive puzzle challenge. Strategically connect vibrant dots with seamless pipes, filling the board without overlaps. With over…",
    image: "https://img.gamepix.com/games/flow-mania/icon/flow-mania.png?w=160",
  },
  {
    namespace: "tic-tac-toe-mania",
    id: "TOC58",
    title: "Tic Tac Toe Mania",
    category: "board",
    description:
      "Tic Tac Toe Mania offers a modern twist on a classic duel of wits. Strategically outmaneuver your opponent on three-by-three or five-by-five grids. Aim for victory by…",
    image:
      "https://img.gamepix.com/games/tic-tac-toe-mania/icon/tic-tac-toe-mania.png?w=160",
  },
  {
    namespace: "checkers-legend",
    id: "75C06",
    title: "Checkers Legend",
    category: "board",
    description:
      "Master classic strategy with Checkers Legend! Play against a clever AI opponent, plotting each move with precision. Jump over rivals to capture pieces and outwit your…",
    image:
      "https://img.gamepix.com/games/checkers-legend/icon/checkers-legend.png?w=160",
  },
  {
    namespace: "chess-master-3d",
    id: "HECE6",
    title: "Chess Master 3D",
    category: "board",
    description:
      "Step into the immersive world of Chess Master 3D, where classic chess strategy meets stunning visuals. Navigate your pieces with precision and foresight, challenging the…",
    image:
      "https://img.gamepix.com/games/chess-master-3d/icon/chess-master-3d.png?w=160",
  },
  {
    namespace: "word-cargo",
    id: "AW1OR2",
    title: "Word Cargo Puzzle",
    category: "word",
    description:
      "Challenge your word skills in Word Cargo, where strategic word placement and quick thinking lead you to victory. With escalating puzzles and intuitive controls, this…",
    image: "https://img.gamepix.com/games/word-cargo/icon/word-cargo.png?w=160",
  },
  {
    namespace: "crossword-3d",
    id: "2O6576",
    title: "Crossword Quest 3D",
    category: "word",
    description:
      "Dive into an innovative 3D crossword adventure in Crossword Quest 3D! Challenge your mind with intersecting word clues on a visually captivating grid. Enhance your…",
    image:
      "https://img.gamepix.com/games/crossword-3d/icon/crossword-3d.png?w=160",
  },
  {
    namespace: "penalty-kick-wiz",
    id: "65666",
    title: "Penalty Kick Wiz",
    category: "sports",
    description:
      "Step into the adrenaline-filled duel of Penalty Kick Wiz, where every shot and save is a crucial dance of precision and anticipation. Master the art of split-second…",
    image:
      "https://img.gamepix.com/games/penalty-kick-wiz/icon/penalty-kick-wiz.png?w=160",
  },
  {
    namespace: "billiards-on-ice",
    id: "A97NE0",
    title: "Billiards on Ice",
    category: "sports",
    description: "A fun sports game you can pick up in seconds.",
    image:
      "https://img.gamepix.com/games/billiards-on-ice/icon/billiards-on-ice.png?w=160",
  },
];

const BY_NAMESPACE = new Map(GAMES.map((game) => [game.namespace, game]));

export function findGame(namespace: string | undefined): Game | undefined {
  return namespace ? BY_NAMESPACE.get(namespace) : undefined;
}

/** Where the game runs. GamePix's own address for the embeddable game. */
export function gamePlayUrl(namespace: string): string {
  return `https://play.gamepix.com/${namespace}/embed?sid=SW281`;
}

/**
 * The universal link that opens a game inside the app. The domain is already
 * registered for the app, and its apple-app-site-association file allows every
 * path, so no hosting change is needed for a new game.
 */
export function gameLink(namespace: string): string {
  return `https://link.newsspend.com/games/${namespace}`;
}
