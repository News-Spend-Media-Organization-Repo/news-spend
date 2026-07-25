import type { StationInfo } from "node-internet-radio";
import internetRadio from "node-internet-radio";
import { RadioBrowserApi } from "radio-browser-api";
import z from "zod";

import { publicProcedure } from "../index";

// Genres definition
const genres = [
  {
    tag: "pop",
    displayName: "Pop Music",
    tagList: ["pop", "pop rock", "pop culture", "top 40", "dance pop"],
  },
  {
    tag: "rock",
    displayName: "Rock",
    tagList: [
      "rock",
      "hard rock",
      "classic rock",
      "alternative rock",
      "indie rock",
    ],
  },
  {
    tag: "jazz",
    displayName: "Jazz",
    tagList: ["jazz", "smooth jazz", "jazz fusion", "bebop", "latin jazz"],
  },
  {
    tag: "afrobeats",
    displayName: "Afrobeat",
    tagList: [
      "afrobeat",
      "afrofusion",
      "afrobeats",
      "afropop",
      "highlife",
      "nigerian music",
    ],
  },
  {
    tag: "classical",
    displayName: "Classical",
    tagList: ["classical", "classical music", "baroque", "opera", "symphony"],
  },
  {
    tag: "electronic",
    displayName: "Electronic",
    tagList: ["electronic", "edm", "techno", "house", "dubstep"],
  },
  {
    tag: "hiphop",
    displayName: "Hip Hop",
    tagList: ["hiphop", "hip hop rap", "trap", "r&b", "urban"],
  },
  {
    tag: "reggae",
    displayName: "Reggae",
    tagList: ["reggae", "reggae fusion", "dub", "ska", "roots reggae"],
  },
  {
    tag: "country",
    displayName: "Country",
    tagList: ["country", "country rock", "folk", "bluegrass", "americana"],
  },
];

const TopInput = z.object({
  limit: z.number().int().min(1).max(100),
});
const StreamMetadataInput = z.object({
  streamUrl: z.url(),
});

const byGenreGroup = publicProcedure.handler(async () => {
  const api = new RadioBrowserApi("News Spend Media", true);

  const stationResponse = genres.map((genre) =>
    api.searchStations({
      tag: genre.tag,
      limit: 20,
      order: "random",
      reverse: true,
      removeDuplicates: true,
    })
  );

  const nigerianStations = await api.searchStations({
    country: "Nigeria",
    limit: 20,
    order: "random",
    reverse: true,
    removeDuplicates: true,
  });

  const response = await Promise.all(stationResponse);

  const stations = response.map((stationList, index) => ({
    stations: stationList.slice(0, 10),
    displayName: genres[index]?.displayName,
  }));

  stations.unshift({
    stations: nigerianStations.slice(0, 10),
    displayName: "Nigeria",
  });

  return stations;
});

const top = publicProcedure.input(TopInput).handler(async ({ input }) => {
  const api = new RadioBrowserApi("News Spend Media", true);
  try {
    const stations = await api.getStationsByVotes(input.limit * 3);
    const shuffled = (stations ?? []).sort(() => Math.random() - 0.5);
    return shuffled.slice(0, input.limit);
  } catch (error) {
    console.error(error);
    return [];
  }
});

const getStreamMetadata = publicProcedure
  .input(StreamMetadataInput)
  .handler(async ({ input }) => {
    const getStationInfoAsync = (url: string) =>
      new Promise<StationInfo>((resolve, reject) => {
        internetRadio.getStationInfo(url, (error, station) => {
          if (error) {
            reject(error);
          } else {
            resolve(station);
          }
        });
      });

    try {
      const station = await getStationInfoAsync(input.streamUrl);
      return {
        metadata: station,
        success: true,
      };
    } catch {
      return {
        metadata: null,
        success: false,
      };
    }
  });

export const radioStationRouter = {
  byGenreGroup,
  top,
  getStreamMetadata,
};
