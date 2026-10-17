import type { JSX, ReactNode } from "react";
import { hueForId } from "../../lib/format";

interface AvatarProps {
  id: number;
  displayName: string;
  size?: number;
  className?: string;
}

export function Avatar({ id, displayName, size = 32, className = "" }: AvatarProps): JSX.Element {
  const hue = hueForId(id);
  const bg = `oklch(0.62 0.11 ${hue})`;
  const fg = "white";
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full ${className}`}
      style={{ background: bg, color: fg, width: size, height: size }}
      title={displayName}
    >
      <span
        className="material-symbols-rounded select-none leading-none"
        style={{ fontSize: Math.round(size * 0.65) }}
      >
        person
      </span>
    </span>
  );
}

interface ListenersStackProps {
  listeners: { id: number; displayName: string }[];
  max?: number;
}

export function ListenersStack({ listeners, max = 5 }: ListenersStackProps): JSX.Element | null {
  if (listeners.length === 0) return null;
  const shown = listeners.slice(0, max);
  const rest = listeners.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((l) => (
        <Avatar
          key={l.id}
          id={l.id}
          displayName={l.displayName}
          size={30}
          className="outline-2 outline-outline-variant"
        />
      ))}
      {rest > 0 && (
        <span
          className="grid size-[30px] place-items-center rounded-full bg-surface-container-high text-[12px] font-medium text-on-surface-variant outline-2 outline-outline-variant"
          title={`${rest} more listening`}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }): ReactNode {
  return <div className={`shimmer bg-surface-container-highest ${className}`} />;
}

interface LabelChipProps {
  children: ReactNode;
  tone?: "surface" | "error";
  dotted?: boolean;
  className?: string;
}

export function LabelChip({
  children,
  tone = "surface",
  dotted,
  className = "",
}: LabelChipProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
        tone === "error"
          ? "bg-error-container text-on-error-container"
          : "bg-surface-container-high text-on-surface-variant"
      } ${className}`}
    >
      {dotted && <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden />}
      {children}
    </span>
  );
}
