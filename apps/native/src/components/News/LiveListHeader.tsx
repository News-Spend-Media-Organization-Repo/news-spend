import type { News } from "@news-spend-media/payload/types";
import { FlashList } from "@shopify/flash-list";
import { Heading, Square, Stack } from "tamagui";

import { Image } from "#/components/ui";
import VideoNewsItem from "#/components/videoNews/VideoNewsItem";

const blurhash = [
  "UZ1Y5^IuIuM{R*V?RjRj0fRjRjRj",
  "UHHp6w~p02000DDiMd?a9OWA#$kEQ,tR%MnM",
  "LGF5?xYk^6#M@-5c,1J5@[or[Q6.",
  "LKN]Rv%2Tw=w]~RBVZRi};RPxuwH",
  "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
  "LKN]Rv%2Tw=w]~RBVZRi};RPxuwH",
];

export default function LiveListHeader({ news }: { news: News }) {
  const renderProgramsItem = ({ item, index }) => (
    <Square br="$4" h={170} ov="hidden" w={150}>
      <Image
        cachePolicy="memory-disk"
        contentFit="cover"
        h="100%"
        placeholder={{
          blurhash: blurhash.at(Math.floor(Math.random() * blurhash.length))!,
        }}
        source={`https://picsum.photos/250/${514 * (index + 2)}`}
        w="100%"
      />
    </Square>
  );

  return (
    <Stack gap="$2" mb="$2">
      <VideoNewsItem videoNews={news} />

      <Stack gap="$1.5">
        <Heading fos="$6">TV Programs</Heading>
        <FlashList
          data={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
          horizontal
          ItemSeparatorComponent={() => <Square w={15} />}
          keyExtractor={(_item, index) => index.toString()}
          renderItem={renderProgramsItem}
          showsHorizontalScrollIndicator={false}
          // recycleItems
        />
      </Stack>

      <Heading fos="$6" mt="$2">
        Latest Videos
      </Heading>
    </Stack>
  );
}
