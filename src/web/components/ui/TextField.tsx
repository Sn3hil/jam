import type { JSX, KeyboardEvent, ReactNode, Ref } from "react";
import { useState } from "react";

interface TextFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: string;
  type?: string;
  label?: string;
  errorText?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  children?: ReactNode;
  ariaLabel?: string;
  inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">;
}

export function TextField({
  value,
  onChange,
  placeholder,
  icon,
  type = "text",
  label,
  errorText,
  className = "",
  inputRef,
  onKeyDown,
  children,
  ariaLabel,
  inputProps,
}: TextFieldProps): JSX.Element {
  const [focused, setFocused] = useState(false);
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-[13px] font-medium text-on-surface-variant">{label}</span>}
      <div
        className={`flex h-14 items-center gap-3 rounded-2xl bg-surface-container-high px-4 transition-[box-shadow] ${
          focused ? "shadow-[0_0_0_2px_var(--md-sys-color-primary)]" : ""
        }`}
      >
        {icon && (
          <span className="material-symbols-rounded shrink-0 text-on-surface-variant" aria-hidden>
            {icon}
          </span>
        )}
        <input
          ref={inputRef}
          type={type}
          className="min-w-0 flex-1 bg-transparent text-[16px] border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 placeholder:text-on-surface-variant/70"
          placeholder={placeholder}
          value={value}
          aria-label={ariaLabel ?? placeholder}
          onChange={(e) => onChange(e.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          {...inputProps}
        />
        {value && (
          <button
            type="button"
            aria-label="clear"
            className="material-symbols-rounded grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-[18px] text-on-surface-variant hover:bg-on-surface/10"
            onClick={() => onChange("")}
          >
            close
          </button>
        )}
      </div>
      {errorText && <span className="mt-1 block text-[12px] text-error">{errorText}</span>}
      {children}
    </label>
  );
}
