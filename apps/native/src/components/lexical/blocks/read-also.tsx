import type { News } from "@news-spend-media/payload/types";
import { useNavigation } from "@react-navigation/native";
import { SizableText, Stack } from "tamagui";

function ReadAlso({ news }: { news: News }) {
  const navigation = useNavigation();

  const onPress = () => {
    navigation.navigate(news.type === "article" ? "News" : "SingleLive", {
      id: news.id as string,
      slug: news.slug as string,
    });
  };

  return (
    <Stack backgroundColor="#F3F1F1" my="$3" onPress={onPress} px="$2">
      <SizableText fow="700">
        {news.type === "article" ? "Read Also" : "Watch Also"}:{" "}
        <SizableText fos="$4" fow="600">
          {news.title}
        </SizableText>
      </SizableText>
    </Stack>
  );
}

export default ReadAlso;
