import { Skeleton } from "@alloc/moti/skeleton";
import type { News } from "@news-spend-media/payload/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useRef } from "react";
import { Pressable } from "react-native";
import { SizableText, Stack, type TamaguiElement, Text, XStack } from "tamagui";
import {
  ChatBold,
  PencilSimpleLine,
  ThumbsDownBold,
  ThumbsDownFill,
  ThumbsUpBold,
  ThumbsUpFill,
} from "tamagui-phosphor";

import { useSafeAreaInsetsStyle } from "#/utils/useSafeAreaInsetsStyle";

import { ShareNews } from "./ShareNews";

type NewsActionBarProps = {
  news: News;
  onComment?: () => void;
  onDislike?: () => void;
  onLike?: () => void;
  onShare?: (shareMethod: string) => void;
};

export function NewsActionBar(props: NewsActionBarProps) {
  const commentRef = useRef<TamaguiElement>(null);
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsetsStyle(["bottom"]);

  const isLiked = props.news?.userReaction === "like";
  const isDisliked = props.news?.userReaction === "dislike";

  const navigateToComments = (focus?: boolean) => {
    props.onComment?.();
    if (route.name === "News") {
      navigation.navigate("Comment", {
        newsId: props.news?.id!,
        newsSlug: props.news?.slug!,
        focus,
      });
    } else {
      navigation.navigate("LiveComment", {
        newsId: props.news?.id!,
        newsSlug: props.news?.slug!,
        focus,
      });
    }
  };

  return (
    <Skeleton
      colorMode="light"
      disableExitAnimation
      height={70 + (insets.paddingBottom || 0)}
      radius={0}
      show={!props.news}
      width="100%"
    >
      {props.news ? (
        <XStack
          ai="center"
          backgroundColor="$s50"
          btc="#E5E5E5"
          btw={1}
          jc="space-around"
          py="$2.5"
          style={insets}
          w="100%"
        >
          {/* Main comment input button */}
          <XStack
            ai="center"
            bg="$p500"
            borderRadius={20}
            flex={3}
            h={40}
            jc="space-around"
            mx={8}
            onPress={() => navigateToComments(true)}
            overflow="hidden"
            pressStyle={{ opacity: 0.8 }}
            px={6}
          >
            <Text color="$background">Let's talk about it</Text>
            <PencilSimpleLine color="$background" size={19} />
          </XStack>

          {/* Comment count */}
          <Stack ai="center" flex={1} jc="center">
            <Pressable onPress={() => navigateToComments()}>
              <Stack position="relative">
                <ChatBold size={30} />
                <Stack bottom={18} left={29} pos="absolute">
                  <SizableText fontWeight="600" size="$1">
                    {props.news.totalComments ?? 0}
                  </SizableText>
                </Stack>
              </Stack>
            </Pressable>
          </Stack>

          {/* Like button */}
          <Stack ai="center" flex={1} jc="center">
            <Pressable onPress={() => props.onLike?.()}>
              <Stack position="relative">
                {isLiked ? (
                  <ThumbsUpFill color="$p500" size={30} />
                ) : (
                  <ThumbsUpBold color="$p500" size={30} />
                )}
                <Stack bottom={18} left={28} pos="absolute">
                  <SizableText fontWeight="600" size="$1">
                    {(props.news?.likesCount ?? 0) + (props.news?.totalCommentLikes ?? 0)}
                  </SizableText>
                </Stack>
              </Stack>
            </Pressable>
          </Stack>

          {/* Dislike button */}
          <Stack ai="center" flex={1} jc="center">
            <Pressable onPress={() => props.onDislike?.()}>
              <Stack position="relative">
                {isDisliked ? (
                  <ThumbsDownFill color="$p500" size={30} />
                ) : (
                  <ThumbsDownBold color="$p500" size={30} />
                )}
                <Stack bottom={18} left={29} pos="absolute">
                  <SizableText fontWeight="600" size="$1">
                    {props.news?.dislikesCount ?? 0}
                  </SizableText>
                </Stack>
              </Stack>
            </Pressable>
          </Stack>

          {/* Share button */}
          <Stack ai="center" flex={1} jc="center">
            <ShareNews news={props.news} onShare={props.onShare} />
          </Stack>
        </XStack>
      ) : null}
    </Skeleton>
  );
}
