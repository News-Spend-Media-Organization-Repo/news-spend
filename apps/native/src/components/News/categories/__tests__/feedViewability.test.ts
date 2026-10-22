jest.mock("#/hooks/news/useNewsAnalytics", () => ({
  useNewsAnalytics: () => ({ trackImpression: jest.fn() }),
}));
jest.mock("#/hooks/usePartnerEvents", () => ({
  usePartnerEvents: () => ({ trackImpression: jest.fn() }),
}));

import { renderHook } from "@testing-library/react-native";

import { usePartnerImpressionViewability } from "#/hooks/news/usePartnerImpressionViewability";
import {
  buildCategoryViewabilityProps,
  buildLatestViewabilityPairs,
} from "../feedViewability";

const noop = () => undefined;

type Config = {
  id?: string;
  itemVisiblePercentThreshold?: number;
  minimumViewTime?: number;
};

const idsOf = (configs: Config[]) => configs.map((c) => c.id);
const isDefined = (id: string | undefined) =>
  typeof id === "string" && id !== "";

describe("feed list viewability configs", () => {
  it("gives every pair on the home feed a defined, unique id", async () => {
    const { result } = await renderHook(() =>
      usePartnerImpressionViewability()
    );
    const pairs = buildLatestViewabilityPairs(noop, noop, result.current);
    expect(pairs).toHaveLength(3);
    {
      const ids = idsOf(pairs.map((p) => p.viewabilityConfig as Config));
      expect(ids.every(isDefined)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const partner = pairs[2]?.viewabilityConfig as Config | undefined;
    expect(partner?.itemVisiblePercentThreshold).toBe(50);
    expect(partner?.minimumViewTime).toBe(1000);
  });

  it("keeps the home feed's existing thresholds and timings", async () => {
    const { result } = await renderHook(() =>
      usePartnerImpressionViewability()
    );
    const [mechanics, article] = buildLatestViewabilityPairs(
      noop,
      noop,
      result.current
    );
    expect(mechanics?.viewabilityConfig as Config).toMatchObject({
      itemVisiblePercentThreshold: 40,
    });
    expect(article?.viewabilityConfig as Config).toMatchObject({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 1000,
    });
  });

  it("gives the category tab's ad-preload config and partner pair distinct ids", async () => {
    const { result } = await renderHook(() =>
      usePartnerImpressionViewability()
    );
    const props = buildCategoryViewabilityProps(result.current);
    expect(props.viewabilityConfig.viewAreaCoveragePercentThreshold).toBe(0);
    {
      const ids = idsOf([
        props.viewabilityConfig,
        ...props.viewabilityConfigCallbackPairs.map((p) => p.viewabilityConfig),
      ]);
      expect(ids.every(isDefined)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const partner = props.viewabilityConfigCallbackPairs[0]?.viewabilityConfig;
    expect(partner?.itemVisiblePercentThreshold).toBe(50);
    expect(partner?.minimumViewTime).toBe(1000);
  });
});
