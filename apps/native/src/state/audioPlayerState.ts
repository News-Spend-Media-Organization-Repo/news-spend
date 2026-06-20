import { type AudioPlaylist, createAudioPlaylist } from "expo-audio";
import type { Station } from "radio-browser-api";
import { toast } from "sonner-native";
import { proxy, subscribe, useSnapshot } from "valtio";

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

// Persist state, explicitly excluding timerRef and runtime-only fields
subscribe(playerState, () => {
  const { timerRef, currentTrack, isReady, ...persistable } = playerState;
  storage.set("playerState", JSON.stringify(persistable));
});

// --- Playlist singleton ---

// On Fast Refresh the JS module re-evaluates and a module-scope `let` would
// reset to `null`, leaving the *previous* native AVPlayer/HTMLAudioElement
// orphaned and still playing. Stash the active instance on globalThis so the
// freshly re-evaluated module can find and destroy it before building a new one.
const GLOBAL_AUDIO_KEY = "__newsSpendAudioPlaylist" as const;
const globalForAudio = globalThis as typeof globalThis & {
  [GLOBAL_AUDIO_KEY]?: AudioPlaylist | null;
};

function getStoredAudioPlaylist(): AudioPlaylist | null {
  return globalForAudio[GLOBAL_AUDIO_KEY] ?? null;
}

function setStoredAudioPlaylist(playlist: AudioPlaylist | null): void {
  globalForAudio[GLOBAL_AUDIO_KEY] = playlist;
}

let audioPlaylist: AudioPlaylist | null = getStoredAudioPlaylist();
let currentStationList: Station[] = [];
let streamFailureTimeout: NodeJS.Timeout | null = null;

const STREAM_TIMEOUT_MS = 15_000;

function clearStreamTimeout() {
  if (streamFailureTimeout) {
    clearTimeout(streamFailureTimeout);
    streamFailureTimeout = null;
  }
}

function disposeAudioPlaylist(): void {
  const playlist = audioPlaylist;
  audioPlaylist = null;
  setStoredAudioPlaylist(null);
  if (!playlist) {
    return;
  }
  try {
    playlist.pause();
  } catch {
    // ignore
  }
  try {
    playlist.clear();
  } catch {
    // ignore
  }
  try {
    playlist.destroy();
  } catch {
    // ignore
  }
}

function resetPlaylistState() {
  disposeAudioPlaylist();
  currentStationList = [];
  playerState.currentTrack = null;
  playerState.hasNext = false;
  playerState.hasPrevious = false;
  playerState.isReady = false;
}

function setStreamTimeout(stationName: string) {
  clearStreamTimeout();
  streamFailureTimeout = setTimeout(() => {
    if (
      audioPlaylist &&
      !audioPlaylist.playing &&
      !audioPlaylist.isBuffering &&
      !audioPlaylist.isLoaded
    ) {
      resetPlaylistState();
      toast.info("Unable to connect to station", {
        description: `${stationName} is not responding. Please try another station.`,
      });
    }
    streamFailureTimeout = null;
  }, STREAM_TIMEOUT_MS);
}

export function setupAudio() {
  // Re-evaluate module after Fast Refresh: the local `audioPlaylist` `let`
  // was just rebound from globalThis, so this is the same instance. If a
  // previous native instance exists (e.g. setupAudio was never re-called
  // after a hot reload that dropped the `let`), tear it down to avoid the
  // dual-player orphan.
  const existing = audioPlaylist ?? getStoredAudioPlaylist();
  if (existing && existing !== audioPlaylist) {
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
  if (audioPlaylist) {
    return;
  }

  audioPlaylist = createAudioPlaylist({ sources: [], loop: "none" });
  setStoredAudioPlaylist(audioPlaylist);

  audioPlaylist.addListener("playlistStatusUpdate", ({ playing }) => {
    if (playing) {
      clearStreamTimeout();
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

function updatePlaylistState() {
  if (!audioPlaylist) {
    return;
  }
  playerState.hasNext = audioPlaylist.currentIndex < audioPlaylist.trackCount - 1;
  playerState.hasPrevious = audioPlaylist.currentIndex > 0;
}

function attachPlaylistListeners() {
  if (!audioPlaylist) {
    return;
  }
  audioPlaylist.addListener("playlistStatusUpdate", ({ playing }) => {
    if (playing) {
      clearStreamTimeout();
      startTimer();
    } else {
      stopTimer();
    }
  });
}

// Live radio streams can't be resumed — force a fresh connection
function reloadCurrentStream() {
  if (!audioPlaylist) {
    return;
  }
  const currentIndex = audioPlaylist.currentIndex;
  const station = currentStationList[currentIndex];
  if (!station) {
    return;
  }

  const track = stationToTrack(station);

  audioPlaylist.pause();
  audioPlaylist.clear();
  audioPlaylist.add({ uri: track.url });
  audioPlaylist.skipTo(0);
  audioPlaylist.play();
  updatePlaylistState();

  playerState.currentTrack = track;
  setStreamTimeout(station.name ?? "Unknown Station");
}

// --- Playback controls ---

export const releaseAudioPlaylist = () => {
  clearStreamTimeout();
  stopTimer();
  disposeAudioPlaylist();
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
    stations.findIndex((s) => s?.id === item?.id),
  );
  const tracks = stations.map(stationToTrack).filter((t) => t.url);

  if (!tracks.length) {
    toast.info("There was an error loading the station. Please try another station.");
    return;
  }

  // Always cancel any pending failure timeout before loading a new track
  clearStreamTimeout();
  stopTimer();

  try {
    if (audioPlaylist) {
      // Fully reset the existing playlist to a clean state before reuse
      audioPlaylist.pause();
      audioPlaylist.clear();
    } else {
      audioPlaylist = createAudioPlaylist({ sources: [], loop: "none" });
      setStoredAudioPlaylist(audioPlaylist);
      attachPlaylistListeners();
      playerState.isReady = true;
    }

    for (const track of tracks) {
      audioPlaylist.add({ uri: track.url });
    }

    currentStationList = stations;
    audioPlaylist.skipTo(startIndex);
    audioPlaylist.play();
    updatePlaylistState();

    playerState.currentTrack = stationToTrack(item);
    setStreamTimeout(item.name ?? "Unknown Station");
  } catch (error) {
    console.error(error);
    // On error, fully tear down so the next loadTrack starts fresh
    disposeAudioPlaylist();
    currentStationList = [];
    playerState.currentTrack = null;
    playerState.hasNext = false;
    playerState.hasPrevious = false;
    playerState.isReady = false;
    toast.info("Playback Error", {
      description: "There was an error playing this station. Please try another station.",
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
