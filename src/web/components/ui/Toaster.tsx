import { useEffect } from "react";
import type { JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import { springs } from "../../theme/motion";
import { useToastStore } from "../../state/toasts";

export function Toaster(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const last = toasts[toasts.length - 1];

  useEffect(() => {
    if (toasts.length > 3) dismiss(toasts[0]?.id ?? 0);
  }, [toasts, dismiss]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {last && (
          <motion.div
            key={last.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={springs.effects.default}
            className="pointer-events-auto flex max-w-[min(560px,92vw)] items-center gap-3 rounded-xl bg-inverse-surface px-4 py-3 text-[14px] text-inverse-on-surface shadow-xl shadow-black/30"
          >
            <span className="min-w-0 flex-1 truncate">{last.text}</span>
            {last.action && last.actionLabel && (
              <button
                type="button"
                className="shrink-0 rounded-lg px-3 py-1 font-semibold text-inverse-primary hover:bg-inverse-surface/10"
                onClick={last.action}
              >
                {last.actionLabel}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
