import type { JSX } from "react";
import { useLocation } from "wouter";
import type { UserDTO } from "@shared/protocol";
import { HistoryPanel } from "../components/history/HistoryPanel";
import { IconButton } from "../components/ui/Button";

interface HistoryPageProps {
  me: UserDTO;
  onBack?: () => void;
}

export function HistoryPage({ me: _me, onBack }: HistoryPageProps): JSX.Element {
  const [, setLocation] = useLocation();

  const handleBack = (): void => {
    if (onBack) {
      onBack();
    } else {
      setLocation("/");
    }
  };

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-surface/80 px-4 py-3 backdrop-blur-xl md:px-8 border-b border-outline-variant/30">
        <div className="flex items-center gap-3">
          <IconButton
            icon="arrow_back"
            label="Back to Room"
            onClick={handleBack}
            className="text-on-surface"
          />
          <h1 className="text-[18px] font-semibold tracking-tight">Listening History</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <HistoryPanel />
      </main>
    </div>
  );
}
