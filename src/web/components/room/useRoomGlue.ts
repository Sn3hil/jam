import { useEffect, useRef } from "react";
import type { JSX } from "react";
import type { UserDTO } from "@shared/protocol";
import { startWs, type WsManager } from "../../lib/ws";
import { audioEngine } from "../../audio/audioEngine";
import { useRoomStore } from "../../state/room";
import { useUiStore } from "../../state/ui";
import {
  setPlaybackState,
  presentYoutubeMedia,
  setMediaSessionHandlers,
  clearMediaSession,
} from "../../audio/mediaSession";

export function useRoomSockets(me: UserDTO): void {
  const { id, username, displayName } = me;
  useEffect(() => {
    const manager: WsManager = startWs({ id, username, displayName });
    return () => {
      manager.dispose();
      useRoomStore.getState().setConnection("connecting");
    };
  }, [id, username, displayName]);
}

export function useAudioVolumeSync(): void {
  const volume = useUiStore((s) => s.volume);
  const muted = useUiStore((s) => s.muted);
  useEffect(() => {
    audioEngine.applyVolume(volume, muted);
  }, [volume, muted]);
}

export function useJoinedAudioSync(): void {
  const joined = useRoomStore((s) => s.joined);
  const np = useRoomStore((s) => s.state?.nowPlaying ?? null);
  const videoId = np?.videoId ?? null;
  const itemId = np?.itemId ?? null;
  const title = np?.title ?? null;
  const channel = np?.channel ?? null;
  const status = useRoomStore((s) => s.state?.status ?? "idle");

  const prevItemIdRef = useRef<string | null>(null);
  const initialMountRef = useRef(true);

  // Instantly cut or resync audio when the playing track is removed or changed
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      prevItemIdRef.current = itemId;
      return;
    }

    const prevId = prevItemIdRef.current;
    prevItemIdRef.current = itemId;

    if (prevId !== null && itemId === null) {
      // Current track was removed -> immediately flush audio buffer so nothing lingers!
      audioEngine.stopAndFlush();
    } else if (prevId !== null && itemId !== null && prevId !== itemId) {
      // Track switched -> immediately resync to purge old track's remaining buffered frames
      audioEngine.resync();
    }
  }, [itemId]);

  // When room status is paused or idle, pause/flush local audio; when playing and joined, resume
  useEffect(() => {
    if (!joined) return;
    if (status === "paused") {
      audioEngine.pause();
    } else if (status === "idle" || !itemId) {
      audioEngine.stopAndFlush();
    } else if (status === "playing" && itemId) {
      if (!audioEngine.isPlaying()) {
        void audioEngine.resume();
      }
    }
  }, [joined, status, itemId]);

  useEffect(() => {
    if (videoId) {
      presentYoutubeMedia({
        videoId,
        title: title ?? videoId,
        channel: channel ?? "Jam",
      });
    } else {
      clearMediaSession();
    }
  }, [videoId, title, channel]);

  useEffect(() => {
    setMediaSessionHandlers({
      onPlayOrResume: () => {
        void audioEngine.resume();
      },
      onPause: () => audioEngine.leave(),
    });
  }, []);

  useEffect(() => {
    setPlaybackState(joined && status === "playing" ? "playing" : "paused");
  }, [joined, status]);
}

export function AudioLayer(): JSX.Element | null {
  useAudioVolumeSync();
  useJoinedAudioSync();
  return null;
}
