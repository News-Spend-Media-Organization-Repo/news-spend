import type { PromoVideoSource } from "@news-spend-media/payload/types";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";
import YoutubePlayer, { PLAYER_STATES } from "react-native-youtube-iframe";
import { Stack } from "tamagui";

function extractYouTubeId(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : "";
}

const YoutubePromoPlayer = forwardRef<
  { play: () => void; pause: () => void; isPlaying: () => boolean },
  { item: PromoVideoSource }
>(({ item }, AdCarouselRef) => {
  const videoId = extractYouTubeId(item.url || "");
  const [playing, setPlaying] = useState(false);

  useImperativeHandle(
    AdCarouselRef,
    () => ({
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      isPlaying: () => playing,
    }),
    []
  );

  const onStateChange = useCallback((state: PLAYER_STATES) => {
    switch (state) {
      case PLAYER_STATES.ENDED:
        setPlaying(false);
        break;
      case PLAYER_STATES.PLAYING:
        setPlaying(true);
        break;
      case PLAYER_STATES.PAUSED:
        setPlaying(false);
        break;
      // case PLAYER_STATES.UNSTARTED:
      //   setPlaying(false);
      //   break;
      // case PLAYER_STATES.BUFFERING:
      //   setPlaying(false);
      //   break;
      default:
        // Do nothing for other states
        break;
    }
  }, []);

  return (
    <Stack>
      <YoutubePlayer
        height={300}
        onChangeState={onStateChange}
        play={playing}
        videoId={videoId}
      />
    </Stack>
  );
});

export default memo(YoutubePromoPlayer);
