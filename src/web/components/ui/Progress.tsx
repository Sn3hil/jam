import type { JSX } from "react";
import { useEffect, useState } from "react";
import { fmtDuration } from "../../lib/format";

interface WavyProgressProps {
  /** 0..1 */
  progress: number;
  active: boolean;
  totalMs?: number | null;
  className?: string;
  height?: number;
  strokeColor?: string;
  trackColor?: string;
}

const WAVE_WAVELENGTH = 28;

export function WavyProgress({
  progress,
  active,
  totalMs,
  className = "",
  height = 4,
  strokeColor = "var(--md-sys-color-primary)",
  trackColor = "var(--md-sys-color-secondary-container)",
}: WavyProgressProps): JSX.Element {
  const width = 320;
  const amp = active ? 3 : 0;
  const wavelength = WAVE_WAVELENGTH;
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number): void => {
      setPhase(((t - start) / 1000) * 1.5 * Math.PI);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const clamp = Math.min(1, Math.max(0, progress));
  const played = clamp * width;
  const mid = 9;

  const wavePath = (): string => {
    if (played <= 0.5) return "";
    if (amp === 0) return `M 0 ${mid} L ${played.toFixed(1)} ${mid}`;

    const step = 1;
    // Anchor the wave to the front head (x = played) so the head leads and ripples flow backwards
    const yStart = mid + amp * Math.sin(((played - 0) / wavelength) * 2 * Math.PI - phase);
    let d = `M 0 ${yStart.toFixed(2)}`;

    for (let x = step; x <= played; x += step) {
      const y = mid + amp * Math.sin(((played - x) / wavelength) * 2 * Math.PI - phase);
      d += ` L ${x.toFixed(1)} ${y.toFixed(2)}`;
    }

    // Front head of the progress bar (at x = played)
    const yEnd = mid + amp * Math.sin(-phase);
    d += ` L ${played.toFixed(1)} ${yEnd.toFixed(2)}`;

    return d;
  };

  const trackStart = played <= 0.5 ? 0 : Math.min(width, played + 10);

  return (
    <div className={`w-full ${className}`} aria-hidden>
      <svg viewBox={`0 0 ${width} 18`} className="h-auto w-full overflow-visible" aria-hidden="true">
        {trackStart < width && (
          <line
            x1={trackStart}
            y1={mid}
            x2={width}
            y2={mid}
            stroke={trackColor}
            strokeWidth={height}
            strokeLinecap="round"
          />
        )}
        {played > 0.5 && (
          <path
            d={wavePath()}
            fill="none"
            stroke={strokeColor}
            strokeWidth={height}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {totalMs !== null && totalMs !== undefined && (
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-on-surface-variant">
          <span>{fmtDuration(((clamp * totalMs) / 1000) | 0)}</span>
          <span>{fmtDuration(totalMs / 1000)}</span>
        </div>
      )}
    </div>
  );
}

interface LoadingIndicatorProps {
  className?: string;
  size?: number;
}

export function LoadingIndicator({ className = "", size = 28 }: LoadingIndicatorProps): JSX.Element {
  return (
    <span
      className={`inline-grid place-items-center ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="loading"
    >
      <span
        className="block size-full grow-progress border-4 border-transparent motion-safe:animate-morph-spin"
        style={{ borderTopColor: "var(--md-sys-color-primary)", borderRadius: "48%" }}
      />
    </span>
  );
}
