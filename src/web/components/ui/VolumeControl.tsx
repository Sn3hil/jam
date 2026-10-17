import type { JSX } from "react";
import { useUiStore } from "../../state/ui";
import { IconButton } from "./Button";

interface VolumeControlProps {
  className?: string;
  compact?: boolean;
}

export function VolumeControl({ className = "", compact = false }: VolumeControlProps): JSX.Element {
  const volume = useUiStore((s) => s.volume);
  const muted = useUiStore((s) => s.muted);
  const setVolume = useUiStore((s) => s.setVolume);
  const setMuted = useUiStore((s) => s.setMuted);

  const effectiveVol = muted ? 0 : volume;

  const iconName =
    muted || effectiveVol === 0 ? "volume_off" : effectiveVol < 0.5 ? "volume_down" : "volume_up";

  const toggleMute = (): void => {
    if (muted) {
      if (volume === 0) setVolume(0.5);
      else setMuted(false);
    } else {
      setMuted(true);
    }
  };

  return (
    <div
      className={`flex items-center gap-1.5 shrink-0 select-none ${className}`}
      title={`Volume: ${Math.round(effectiveVol * 100)}%`}
    >
      <IconButton
        icon={iconName}
        label={muted ? "Unmute" : "Mute"}
        size="sm"
        onClick={toggleMute}
        className="text-on-surface-variant hover:text-on-surface"
      />
      <div className="relative flex items-center">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          aria-label="Volume slider"
          value={effectiveVol}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value);
            setVolume(v);
          }}
          className={`cursor-pointer appearance-none rounded-full bg-surface-container-highest transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            compact ? "h-1.5 w-16 sm:w-20" : "h-1.5 w-20 sm:w-28 md:w-32"
          }`}
          style={{
            accentColor: "var(--md-sys-color-primary)",
          }}
        />
      </div>
    </div>
  );
}
