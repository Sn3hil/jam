import { memo } from "react";
import type { JSX } from "react";
import { thumbnailUrl } from "@shared/youtubeUrl";

interface VinylRecordProps {
  videoId: string | null;
  playing: boolean;
  title?: string;
  size?: "responsive" | "sm" | "md" | "lg";
  className?: string;
}

export const VinylRecord = memo(function VinylRecord({
  videoId,
  playing,
  title = "Now Playing",
  className = "",
}: VinylRecordProps): JSX.Element {
  const artwork = videoId ? thumbnailUrl(videoId) : null;

  return (
    <div className={`relative mx-auto flex items-center justify-center p-6 sm:p-8 select-none ${className}`}>
      {/* Ambient Lighting Behind Record */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center -z-10 overflow-visible"
        aria-hidden
      >
        {/* Layer 1: Saturated blurred artwork glow */}
        {artwork ? (
          <div
            className="absolute size-4/5 rounded-full transition-all duration-1000 ease-out"
            style={{
              backgroundImage: `url(${artwork})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(56px) saturate(2.4) brightness(1.15)",
              opacity: playing ? 0.85 : 0.45,
              transform: playing ? "scale(1.18)" : "scale(1.02)",
            }}
          />
        ) : null}

        {/* Layer 2: Dynamic Material 3 Expressive radial bloom */}
        <div
          className="absolute size-[90%] rounded-full transition-opacity duration-1000 ease-out"
          style={{
            background: `radial-gradient(circle at 50% 50%, 
              var(--md-sys-color-primary) 0%, 
              var(--md-sys-color-tertiary) 42%, 
              transparent 72%)`,
            filter: "blur(48px)",
            opacity: playing ? 0.65 : 0.25,
          }}
        />

        {/* Layer 3: Rotating ambient aura when playing */}
        {playing && (
          <div
            className="absolute size-full rounded-full motion-safe:animate-spin-slow"
            style={{
              background: `conic-gradient(from 0deg at 50% 50%, 
                var(--md-sys-color-primary) 0deg, 
                transparent 90deg, 
                var(--md-sys-color-tertiary) 180deg, 
                transparent 270deg, 
                var(--md-sys-color-primary) 360deg)`,
              filter: "blur(52px)",
              opacity: 0.4,
              animationDuration: "12s",
            }}
          />
        )}
      </div>

      {/* The Vinyl Record Body */}
      <div
        className="relative aspect-square w-64 sm:w-72 md:w-80 lg:w-[380px] max-w-[85vw] rounded-full shadow-2xl transition-transform duration-500 ease-out"
        style={{
          boxShadow: "0 20px 50px -10px rgba(0,0,0,0.65), 0 0 2px 1px rgba(255,255,255,0.08) inset",
        }}
      >
        {/* Rotating disc element */}
        <div
          className="size-full rounded-full"
          style={{
            animation: "lr-vinyl-spin 3.2s linear infinite",
            animationPlayState: playing ? "running" : "paused",
          }}
        >
          {/* Vinyl base plate with groove pattern */}
          <div
            className="relative size-full overflow-hidden rounded-full border border-white/10"
            style={{
              background: "radial-gradient(circle at 50% 50%, #151518 0%, #0d0d0f 70%, #08080a 100%)",
            }}
          >
            {/* Concentric groove rings */}
            <svg
              viewBox="0 0 400 400"
              className="absolute inset-0 size-full pointer-events-none opacity-40"
              aria-hidden
            >
              {[70, 78, 86, 94, 102, 110, 118, 126, 134, 142, 150, 158, 166, 174, 182, 190].map((r) => (
                <circle
                  key={r}
                  cx="200"
                  cy="200"
                  r={r}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeWidth="0.85"
                />
              ))}
            </svg>

            {/* Specular sheen (light reflection sweeps across vinyl) */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 45deg at 50% 50%, rgba(255,255,255,0.12) 0deg, transparent 40deg, transparent 140deg, rgba(255,255,255,0.12) 180deg, transparent 220deg, transparent 320deg, rgba(255,255,255,0.12) 360deg)",
                mixBlendMode: "screen",
              }}
            />

            {/* Center Label Area (Album Artwork) */}
            <div className="absolute inset-[30%] flex items-center justify-center rounded-full border-2 border-black/40 shadow-inner overflow-hidden bg-surface-container-high">
              {artwork ? (
                <img
                  src={artwork}
                  alt={title}
                  className="size-full object-cover rounded-full"
                  loading="eager"
                />
              ) : (
                <div className="grid size-full place-items-center bg-primary-container text-on-primary-container">
                  <span className="material-symbols-rounded text-[36px]" aria-hidden>
                    album
                  </span>
                </div>
              )}

              {/* Inner label groove ring */}
              <div className="pointer-events-none absolute inset-0 rounded-full border border-white/20" />

              {/* Center Spindle Hole */}
              <div
                className="absolute size-5 rounded-full border-2 border-neutral-400 bg-neutral-900 shadow-md"
                style={{
                  background: "radial-gradient(circle at 35% 35%, #555 0%, #1a1a1a 80%)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
