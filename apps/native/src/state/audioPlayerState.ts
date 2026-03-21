import {
  type AudioPlaylist,
  type AudioPlaylistOptions,
  createAudioPlaylist,
} from "expo-audio";
import type { Station } from "radio-browser-api";
import { toast } from "sonner-native";
import { proxy, subscribe, useSnapshot } from "valtio";

import { storage } from "#/utils/storage";

const TIMER_THRESHOLD = 1800;

export type TrackInfo = {
  id: string;
  name: string;
  url: string;
  artwork: string;
  genre: string;
  artist: string;
};

type PlayerState = {
  listeningTime: number;
  timerRef: NodeJS.Timeout | null;
  lastResetDate: number | null;
  pointEarnedToday: boolean;
  currentTrack: TrackInfo | null;
  hasNext: boolean;
  hasPrevious: boolean;
  isReady: boolean;
};

type PersistedPlayerState = Omit<PlayerState, "timerRef">;

const defaultState: PlayerState = {
  listeningTime: 0,
  timerRef: null,
  lastResetDate: null,
  pointEarnedToday: false,
  currentTrack: null,
  hasNext: false,
  hasPrevious: false,
  isReady: false,
};

function loadPersistedState(): PlayerState {
  try {
    const raw = storage.getString("playerState");
    if (!raw) {
      return defaultState;
    }
    const persisted: PersistedPlayerState = JSON.parse(raw);
    return { ...defaultState, ...persisted, timerRef: null, isReady: false };
  } catch {
    return defaultState;
  }
}

export const playerState = proxy<PlayerState>(loadPersistedState());

// Persist state, explicitly excluding timerRef and runtime-only fields
subscribe(playerState, () => {
  const { timerRef, currentTrack, isReady, ...persistable } = playerState;
  storage.set("playerState", JSON.stringify(persistable));
});

// --- Playlist singleton ---

let audioPlaylist: AudioPlaylist | null = null;
let currentStationList: Station[] = [];

export function setupAudio() {
  // Destroy existing playlist if any (e.g. re-login without closing app)
  if (audioPlaylist) {
    audioPlaylist.destroy();
    audioPlaylist = null;
  }

  audioPlaylist = createAudioPlaylist({ sources: [], loop: "none" });

  // Background-safe listener — fires even when app is backgrounded
  audioPlaylist.addListener("playlistStatusUpdate", ({ playing }) => {
    if (playing) {
      startTimer();
    } else {
      stopTimer();
    }
  });

  playerState.isReady = true;
}

export function getAudioPlaylist(): AudioPlaylist | null {
  return audioPlaylist;
}

// --- Helpers ---

const hasDayChanged = (lastResetDate: number | null): boolean => {
  if (lastResetDate === null) {
    return true;
  }
  const currentMidnight = new Date().setHours(0, 0, 0, 0);
  return Date.now() >= currentMidnight && currentMidnight > lastResetDate;
};

if (hasDayChanged(playerState.lastResetDate)) {
  resetDailyListeningTime();
}

function stationToTrack(station: Station): TrackInfo {
  let trackUrl: string | undefined;

  if (station?.url?.startsWith("https:")) {
    trackUrl = station.url;
  } else if (station?.urlResolved?.startsWith("https:")) {
    trackUrl = station.urlResolved;
  } else if (station.url) {
    trackUrl = station.url.replace(/^http:/, "https:");
  } else if (station.urlResolved) {
    trackUrl = station.urlResolved.replace(/^http:/, "https:");
  }

  return {
    id: station.id,
    name: station.name,
    url: trackUrl ?? "",
    artwork: `https://placehold.co/100/5D3FD3/fff.png?text=${encodeURIComponent(station.name ?? "Music")}`,
    genre: station.tags?.join(", ") || "Unknown",
    artist: station.country || "Unknown",
  };
}

function updatePlaylistState() {
  if (!audioPlaylist) {
    return;
  }
  playerState.hasNext =
    audioPlaylist.currentIndex < audioPlaylist.trackCount - 1;
  playerState.hasPrevious = audioPlaylist.currentIndex > 0;
}

// Live radio streams can't be resumed — force a fresh connection by
// removing and re-inserting the source at the same index
function reloadCurrentStream() {
  if (!audioPlaylist) {
    return;
  }
  const station = currentStationList[audioPlaylist.currentIndex];
  if (!station) {
    return;
  }

  const track = stationToTrack(station);
  playerState.currentTrack = track;

  const index = audioPlaylist.currentIndex;
  audioPlaylist.remove(index);
  audioPlaylist.insert({ uri: track.url }, index);
  audioPlaylist.skipTo(index);
  audioPlaylist.play();
}

// --- Playback controls ---

export const releaseAudioPlaylist = () => {
  if (audioPlaylist) {
    audioPlaylist.clear();
    audioPlaylist.destroy();
    audioPlaylist = null;
  }
  currentStationList = [];
  playerState.currentTrack = null;
  playerState.hasNext = false;
  playerState.hasPrevious = false;
  playerState.isReady = false;
};

export const playNext = () => {
  if (!(audioPlaylist && playerState.hasNext)) {
    return;
  }
  audioPlaylist.next();
  updatePlaylistState();
  reloadCurrentStream();
};

export const playPrevious = () => {
  if (!(audioPlaylist && playerState.hasPrevious)) {
    return;
  }
  audioPlaylist.previous();
  updatePlaylistState();
  reloadCurrentStream();
};

// Live radio can't be resumed — reload the stream URL when unpausing
export const togglePlayback = () => {
  if (!audioPlaylist) {
    return;
  }
  if (audioPlaylist.playing) {
    audioPlaylist.pause();
  } else {
    reloadCurrentStream();
  }
};

export const loadTrack = (item: Station, stationList?: Station[]) => {
  const stations = stationList?.length ? stationList : [item];
  const startIndex = Math.max(
    0,
    stations.findIndex((s) => s?.id === item?.id)
  );
  const tracks = stations.map(stationToTrack).filter((t) => t.url);

  if (!tracks.length) {
    toast.info(
      "There was an error loading the station. Please try another station."
    );
    return;
  }

  playerState.currentTrack = stationToTrack(item);

  try {
    if (audioPlaylist) {
      audioPlaylist.clear();
      for (const track of tracks) {
        audioPlaylist.add({ uri: track.url });
      }
    } else {
      // Fallback if setupAudio wasn't called — create on the fly
      const options: AudioPlaylistOptions = {
        sources: tracks.map((t) => ({ uri: t.url })),
        loop: "none",
      };
      audioPlaylist = createAudioPlaylist(options);
      playerState.isReady = true;
    }

    currentStationList = stations;
    audioPlaylist.skipTo(startIndex);
    audioPlaylist.play();
    updatePlaylistState();
  } catch (error) {
    console.error(error);
    toast.info("Playback Error", {
      description:
        "There was an error playing this station. Please try another station.",
    });
  }
};

// --- Daily listening timer ---

export function resetDailyListeningTime() {
  playerState.listeningTime = 0;
  playerState.pointEarnedToday = false;
  playerState.lastResetDate = new Date().setHours(0, 0, 0, 0);
}

export const startTimer = () => {
  if (playerState.timerRef) {
    return;
  }
  if (playerState.listeningTime >= TIMER_THRESHOLD) {
    return;
  }

  playerState.timerRef = setInterval(() => {
    playerState.listeningTime += 1;
    if (playerState.listeningTime >= TIMER_THRESHOLD) {
      playerState.pointEarnedToday = true;
      stopTimer();
    }
  }, 1000);
};

export const stopTimer = () => {
  if (playerState.timerRef) {
    clearInterval(playerState.timerRef);
    playerState.timerRef = null;
  }
};

export const usePlayerState = () => useSnapshot(playerState);
