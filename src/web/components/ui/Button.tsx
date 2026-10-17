import type { JSX, CSSProperties, ReactNode, MouseEvent as ReactMouseEvent } from "react";
import { motion } from "motion/react";
import { springs } from "../../theme/motion";

type ButtonVariant = "filled" | "tonal" | "text" | "outlined" | "error" | "ghost";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: string;
  trailingIcon?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
  title?: string;
  ariaLabel?: string;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  filled: "bg-primary text-on-primary",
  tonal: "bg-secondary-container text-on-secondary-container",
  text: "text-primary",
  outlined: "border border-outline text-primary",
  error: "bg-error-container text-on-error-container",
  ghost: "text-on-surface-variant",
};

export function Button({
  variant = "filled",
  size = "md",
  icon,
  trailingIcon,
  type = "button",
  disabled,
  loading,
  className = "",
  style,
  onClick,
  children,
  title,
  ariaLabel,
}: ButtonProps): JSX.Element {
  return (
    <motion.button
      type={type}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled || loading}
      onClick={onClick}
      whileTap={disabled || loading ? undefined : { borderRadius: 8 }}
      animate={{ borderRadius: 9999 }}
      transition={springs.spatial.fast}
      className={`inline-flex items-center justify-center gap-2 px-6 font-medium select-none ${
        size === "sm" ? "h-10 text-[14px]" : "h-14 text-[15px]"
      } ${VARIANT_CLASS[variant]} ${
        variant === "text" || variant === "ghost" ? "px-4" : ""
      } disabled:opacity-40 ${className}`}
      style={style}
    >
      {loading ? (
        <span className="material-symbols-rounded animate-spin" aria-hidden>
          progress_activity
        </span>
      ) : (
        icon && (
          <span className="material-symbols-rounded text-[20px]" aria-hidden>
            {icon}
          </span>
        )
      )}
      {children}
      {trailingIcon && (
        <span className="material-symbols-rounded text-[20px]" aria-hidden>
          {trailingIcon}
        </span>
      )}
    </motion.button>
  );
}

interface IconButtonProps {
  icon: string;
  filled?: boolean;
  label: string;
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function IconButton({
  icon,
  filled,
  label,
  onClick,
  disabled,
  className = "",
  size = "md",
}: IconButtonProps): JSX.Element {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { borderRadius: 14 }}
      animate={{ borderRadius: 9999 }}
      transition={springs.spatial.fast}
      className={`grid place-items-center text-on-surface-variant hover:bg-on-surface/8 disabled:opacity-40 ${
        size === "sm" ? "size-9 text-[20px]" : "size-12 text-[24px]"
      } ${className}`}
    >
      <span className={`material-symbols-rounded ${filled ? "filled" : ""}`} aria-hidden>
        {icon}
      </span>
    </motion.button>
  );
}

interface FabProps {
  icon: string;
  label: string;
  onClick?: () => void;
  size?: "md" | "lg";
  disabled?: boolean;
  className?: string;
}

export function ExtendedFab({
  icon,
  label,
  onClick,
  size = "lg",
  disabled,
  className = "",
}: FabProps): JSX.Element {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.96, borderRadius: 20 }}
      animate={{ borderRadius: 9999 }}
      transition={springs.spatial.slow}
      className={`inline-flex items-center gap-3 bg-primary text-on-primary shadow-lg shadow-black/25 ${
        size === "lg" ? "h-16 px-8 text-[16px]" : "h-12 px-5 text-[14px]"
      } font-semibold disabled:opacity-50 ${className}`}
    >
      <span className="material-symbols-rounded text-[28px]" aria-hidden>
        {icon}
      </span>
      {label}
    </motion.button>
  );
}

interface SegmentedProps<T extends string> {
  segments: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function SegmentedButton<T extends string>({
  segments,
  value,
  onChange,
  className = "",
}: SegmentedProps<T>): JSX.Element {
  return (
    <div role="tablist" className={`inline-flex items-center gap-2 ${className}`}>
      {segments.map((seg) => {
        const selected = seg.value === value;
        return (
          <button
            key={seg.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(seg.value)}
            className={`inline-flex items-center justify-center h-9 px-4 rounded-full text-[13.5px] font-medium transition-all duration-200 cursor-pointer select-none active:scale-95 ${
              selected
                ? "bg-secondary-container text-on-secondary-container shadow-sm border border-secondary-container font-semibold"
                : "bg-surface-container-high/70 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface border border-outline-variant/30"
            }`}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
