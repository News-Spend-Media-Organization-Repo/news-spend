import { nextTrendingIndex } from "../trendingCarousel";

describe("nextTrendingIndex", () => {
  it("bounces off the last card and heads back", () => {
    let state = { index: 5, direction: 1 as 1 | -1 };
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      state = nextTrendingIndex(state.index, 7, state.direction);
      seen.push(state.index);
    }
    expect(seen).toEqual([6, 5, 4]);
    expect(state.direction).toBe(-1);
  });

  it("bounces off the first card and heads forward", () => {
    expect(nextTrendingIndex(1, 7, -1)).toEqual({ index: 0, direction: -1 });
    expect(nextTrendingIndex(0, 7, -1)).toEqual({ index: 1, direction: 1 });
  });

  it("does nothing for empty and single-item lists", () => {
    expect(nextTrendingIndex(0, 0, 1)).toEqual({ index: 0, direction: 1 });
    expect(nextTrendingIndex(0, 1, -1)).toEqual({ index: 0, direction: -1 });
  });
});
