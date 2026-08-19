import {
  type AudioPlayer,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import type { Station } from "radio-browser-api";
import { proxy, subscribe, useSnapshot } from "valtio";

import { toast } from "#/components/heroui/toast";
import { storage } from "#/utils/storage";

const TIMER_THRESHOLD = 1800;
const HTTP_TO_HTTPS = /^http:/;

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

subscribe(playerState, () => {
  const { timerRef, currentTrack, isReady, ...persistable } = playerState;
  storage.set("playerState", JSON.stringify(persistable));
});

// --- Player singleton ---

const GLOBAL_AUDIO_KEY = "__newsSpendAudioPlayer" as const;
const globalForAudio = globalThis as typeof globalThis & {
  [GLOBAL_AUDIO_KEY]?: AudioPlayer | null;
};

function getStoredPlayer(): AudioPlayer | null {
  return globalForAudio[GLOBAL_AUDIO_KEY] ?? null;
}

function setStoredPlayer(player: AudioPlayer | null): void {
  globalForAudio[GLOBAL_AUDIO_KEY] = player;
}

let audioPlayer: AudioPlayer | null = getStoredPlayer();
let currentStationList: Station[] = [];
let currentStationIndex = -1;
let streamFailureTimeout: NodeJS.Timeout | null = null;

const STREAM_TIMEOUT_MS = 15_000;

function clearStreamTimeout() {
  if (streamFailureTimeout) {
    clearTimeout(streamFailureTimeout);
    streamFailureTimeout = null;
  }
}

function disposePlayer(): void {
  const player = audioPlayer;
  audioPlayer = null;
  setStoredPlayer(null);
  lastRegisteredTrackId = null;
  if (!player) {
    return;
  }
  try {
    player.setActiveForLockScreen(false);
  } catch {
    // ignore
  }
  try {
    player.pause();
  } catch {
    // ignore
  }
  try {
    player.destroy();
  } catch {
    // ignore
  }
}

function resetPlayerState() {
  disposePlayer();
  currentStationList = [];
  currentStationIndex = -1;
  playerState.currentTrack = null;
  playerState.hasNext = false;
  playerState.hasPrevious = false;
  playerState.isReady = false;
}

function setStreamTimeout(stationName: string) {
  clearStreamTimeout();
  streamFailureTimeout = setTimeout(() => {
    if (
      audioPlayer &&
      !audioPlayer.playing &&
      !audioPlayer.isBuffering &&
      !audioPlayer.isLoaded
    ) {
      resetPlayerState();
      toast.info("Unable to connect to station", {
        description: `${stationName} is not responding. Please try another station.`,
      });
    }
    streamFailureTimeout = null;
  }, STREAM_TIMEOUT_MS);
}

let lastRegisteredTrackId: string | null = null;

function registerLockScreen() {
  const player = audioPlayer;
  if (!player) {
    return;
  }
  const trackId = playerState.currentTrack?.id ?? null;
  if (trackId === lastRegisteredTrackId) {
    return;
  }
  lastRegisteredTrackId = trackId;
  try {
    player.setActiveForLockScreen(
      true,
      {
        title: playerState.currentTrack?.name || "Live Radio",
        artist: playerState.currentTrack?.genre || "News Spend Radio",
      },
      {
        isLiveStream: true,
      }
    );
  } catch {
    // Lock screen control not available on this platform
  }
}

function unregisterLockScreen() {
  const player = audioPlayer;
  if (!player) {
    return;
  }
  try {
    player.setActiveForLockScreen(false);
  } catch {
    // ignore
  }
}

async function configureAudioSession() {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
  } catch {
    // Non-critical; may already be configured
  }
}

export function setupAudio() {
  void configureAudioSession();

  const existing = audioPlayer ?? getStoredPlayer();
  if (existing && existing !== audioPlayer) {
    try {
      existing.pause();
    } catch {
      // ignore
    }
    try {
      existing.destroy();
    } catch {
      // ignore
    }
  }
  if (audioPlayer) {
    return;
  }

  audioPlayer = createAudioPlayer({ uri: "" });
  setStoredPlayer(audioPlayer);

  audioPlayer.addListener("playbackStatusUpdate", ({ playing }) => {
    if (playing) {
      clearStreamTimeout();
      startTimer();
    } else {
      stopTimer();
    }
  });

  playerState.isReady = true;
}

// AppState.addEventListener("change", (nextState) => {
//   if (nextState === "background" && audioPlayer && !audioPlayer.playing) {
//     releaseAudioPlaylist();
//   }
// });

export function getAudioPlaylist(): AudioPlayer | null {
  return audioPlayer;
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
    trackUrl = station.url.replace(HTTP_TO_HTTPS, "https:");
  } else if (station.urlResolved) {
    trackUrl = station.urlResolved.replace(HTTP_TO_HTTPS, "https:");
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

function updateNavigationState() {
  const list = currentStationList;
  const idx = currentStationIndex;
  playerState.hasNext = idx >= 0 && idx < list.length - 1;
  playerState.hasPrevious = idx > 0;
}

// --- Playback controls ---

export const releaseAudioPlaylist = () => {
  clearStreamTimeout();
  stopTimer();
  disposePlayer();
  currentStationList = [];
  currentStationIndex = -1;
  playerState.currentTrack = null;
  playerState.hasNext = false;
  playerState.hasPrevious = false;
  playerState.isReady = false;
};

function playStation(station: Station, stationList: Station[], index: number) {
  if (!audioPlayer) {
    return;
  }

  const track = stationToTrack(station);
  if (!track.url) {
    toast.info("Unable to play this station. Please try another.");
    return;
  }

  clearStreamTimeout();
  stopTimer();

  audioPlayer.replace({ uri: track.url });
  audioPlayer.play();

  currentStationList = stationList;
  currentStationIndex = index;
  playerState.currentTrack = track;
  registerLockScreen();
  updateNavigationState();
  setStreamTimeout(station.name ?? "Unknown Station");
}

export const playNext = () => {
  if (!(audioPlayer && playerState.hasNext)) {
    return;
  }
  const nextIndex = currentStationIndex + 1;
  const nextStation = currentStationList[nextIndex];
  if (!nextStation) {
    return;
  }
  playStation(nextStation, currentStationList, nextIndex);
};

export const playPrevious = () => {
  if (!(audioPlayer && playerState.hasPrevious)) {
    return;
  }
  const prevIndex = currentStationIndex - 1;
  const prevStation = currentStationList[prevIndex];
  if (!prevStation) {
    return;
  }
  playStation(prevStation, currentStationList, prevIndex);
};

export const togglePlayback = () => {
  if (!audioPlayer) {
    return;
  }
  if (audioPlayer.playing) {
    audioPlayer.pause();
  } else {
    // Live radio can't be resumed, so reload the current stream
    const station = currentStationList[currentStationIndex];
    if (station) {
      playStation(station, currentStationList, currentStationIndex);
    }
  }
};

export const loadTrack = (item: Station, stationList?: Station[]) => {
  if (!playerState.isReady && audioPlayer) {
    disposePlayer();
  }

  const stations = stationList?.length ? stationList : [item];
  const startIndex = Math.max(
    0,
    stations.findIndex((s) => s?.id === item?.id)
  );

  const track = stationToTrack(item);
  if (!track.url) {
    toast.info(
      "There was an error loading the station. Please try another station."
    );
    return;
  }

  clearStreamTimeout();
  stopTimer();
  playerState.currentTrack = null;
  playerState.hasNext = false;
  playerState.hasPrevious = false;

  try {
    if (!audioPlayer) {
      audioPlayer = createAudioPlayer({ uri: "" });
      setStoredPlayer(audioPlayer);
      audioPlayer.addListener("playbackStatusUpdate", ({ playing }) => {
        if (playing) {
          clearStreamTimeout();
          startTimer();
        } else {
          stopTimer();
        }
      });
      playerState.isReady = true;
    }

    currentStationList = stations;
    playStation(item, stations, startIndex);
  } catch (error) {
    console.error(error);
    disposePlayer();
    currentStationList = [];
    currentStationIndex = -1;
    playerState.currentTrack = null;
    playerState.hasNext = false;
    playerState.hasPrevious = false;
    playerState.isReady = false;
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
