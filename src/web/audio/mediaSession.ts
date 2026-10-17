import { thumbnailUrl } from "@shared/youtubeUrl";

export interface PlayerInfo {
  videoId: string;
  title: string;
  channel: string;
}

export function presentYoutubeMedia(meta: PlayerInfo | null): void {
  if (!("mediaSession" in navigator) || !meta) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.channel,
    artwork: [
      { src: thumbnailUrl(meta.videoId), sizes: "320x180", type: "image/jpeg" },
      { src: thumbnailUrl(meta.videoId), sizes: "640x360", type: "image/jpeg" },
    ],
  });
}

export function setMediaSessionHandlers(handlers: { onPlayOrResume: () => void; onPause: () => void }): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.setActionHandler("play", () => handlers.onPlayOrResume());
  navigator.mediaSession.setActionHandler("pause", () => handlers.onPause());
  navigator.mediaSession.setActionHandler("seekbackward", null);
  navigator.mediaSession.setActionHandler("seekforward", null);
  navigator.mediaSession.setActionHandler("seekto", null);
  navigator.mediaSession.setActionHandler("previoustrack", null);
  navigator.mediaSession.setActionHandler("nexttrack", null);
}

export function setPlaybackState(state: "playing" | "paused"): void {
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state;
}

export function clearMediaSession(): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = null;
  setPlaybackState("paused");
}
