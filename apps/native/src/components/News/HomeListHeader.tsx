import type { PartnerContent } from "@news-spend-media/payload/types";
import { Heading, Stack } from "tamagui";

import type { RouterOutputs } from "#/lib/orpc";

import SpecialCoverage from "./SpecialCoverage";
import TrendingBooks from "./TrendingBooks";
import TrendingNews from "./TrendingNews";

type NewsType = RouterOutputs["news"]["home"]["docs"];

export default function HomeListHeader({
  news,
  specialCoverage = [],
  books = [],
}: {
  news: NewsType;
  specialCoverage: NewsType;
  books: PartnerContent[];
}) {
  return (
    <Stack gap="$4" mb="$3">
      <TrendingNews news={news} />

      <TrendingBooks books={books} />

      <SpecialCoverage specialCoverage={specialCoverage} />

      <Heading fos="$6" mt="$3" px="$3">
        Latest News
      </Heading>
    </Stack>
  );
}
