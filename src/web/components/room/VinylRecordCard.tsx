import type { JSX } from "react";
import { useRoomStore } from "../../state/room";
import { VinylRecord } from "./VinylRecord";

export function VinylRecordCard({ className = "" }: { className?: string }): JSX.Element {
  const state = useRoomStore((s) => s.state);
  const playing = useRoomStore((s) => s.joined);
  const np = state?.nowPlaying ?? null;
  const status = state?.status ?? "loading";

  const isActuallyPlaying = status === "playing" && playing;

  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-4xl bg-surface-container/60 p-6 md:p-8 border border-outline-variant/30 backdrop-blur-sm min-h-[340px] md:min-h-[420px] ${className}`}
    >
      <VinylRecord videoId={np?.videoId ?? null} playing={isActuallyPlaying} title={np?.title ?? "Jam"} />
    </div>
  );
}
