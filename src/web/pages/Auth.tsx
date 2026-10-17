import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "../api";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import type { JSX } from "react";
import { describeApiError } from "../lib/ws";

export function Login(): JSX.Element {
  const [, navigate] = useLocation();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: () => apiFetch("/api/auth/login", { body: { username, password } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      void navigate("/");
    },
    onError: (e) => setError(describeApiError(e)),
  });

  const submit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Fill in both fields.");
      return;
    }
    m.mutate();
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-surface px-4">
      <div className="pointer-events-none absolute inset-0 radial-glow" aria-hidden />
      <div className="pointer-events-none absolute left-0 top-24 z-0 hidden opacity-30 md:block" aria-hidden>
        <span className="material-symbols-rounded text-[42vw] text-primary">graphic_eq</span>
      </div>
      <div
        className="pointer-events-none absolute bottom-4 right-0 z-0 hidden opacity-20 md:block"
        aria-hidden
      >
        <span className="material-symbols-rounded text-[30vw] rotate-180 text-secondary">waves</span>
      </div>
      <form onSubmit={submit} className="z-10 w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary-container text-on-primary-container">
            <span className="material-symbols-rounded text-3xl" aria-hidden>
              graphic_eq
            </span>
          </span>
          <div>
            <h1 className="display-md tracking-tight">Jam</h1>
            <p className="text-sm text-on-surface-variant">one room, one stream, everyone together</p>
          </div>
        </div>
        <div className="space-y-3">
          <TextField
            icon="person"
            placeholder="username"
            value={username}
            onChange={setU}
            inputProps={{ autoCapitalize: "none", autoCorrect: "off", spellCheck: false }}
          />
          <TextField icon="lock" placeholder="password" type="password" value={password} onChange={setP} />
          {error && <p className="text-[13px] font-medium text-error">{error}</p>}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => void navigate("/signup")}
              className="text-[14px] font-medium text-primary hover:underline"
            >
              Create account
            </button>
            <Button type="submit" icon="login" loading={m.isPending}>
              Sign in
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export interface SignupProps {
  inviteMatch?: string;
}

export function Signup({ inviteMatch }: SignupProps): JSX.Element {
  const [, navigate] = useLocation();
  const [inviteCode, setI] = useState(inviteMatch ?? "");
  const [username, setU] = useState("");
  const [displayName, setD] = useState("");
  const [password, setP] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: () =>
      apiFetch("/api/auth/signup", {
        body: {
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
          password,
          inviteCode: inviteCode.trim(),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      void navigate("/");
    },
    onError: (e) => setError(describeApiError(e)),
  });

  const submit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password || !inviteCode.trim()) {
      setError("Fill in all fields.");
      return;
    }
    m.mutate();
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-surface px-4">
      <div className="pointer-events-none absolute inset-0 radial-glow" aria-hidden />
      <form onSubmit={submit} className="z-10 w-full max-w-md">
        <div className="mb-10">
          <h1 className="display-md tracking-tight">Join the room</h1>
          <p className="text-sm text-on-surface-variant">you'll need the invite code from the host</p>
        </div>
        <div className="space-y-3">
          <TextField icon="key" placeholder="invite code" value={inviteCode} onChange={setI} />
          <div className="flex gap-3">
            <TextField
              icon="person"
              placeholder="username"
              value={username}
              onChange={setU}
              className="flex-1"
              inputProps={{ autoCapitalize: "none" }}
            />
            <TextField
              icon="badge"
              placeholder="display name"
              value={displayName}
              onChange={setD}
              className="flex-1"
            />
          </div>
          <TextField icon="lock" placeholder="password" type="password" value={password} onChange={setP} />
          {error && <p className="text-[13px] font-medium text-error">{error}</p>}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => void navigate("/login")}
              className="text-[14px] font-medium text-primary hover:underline"
            >
              I have an account
            </button>
            <Button type="submit" icon="how_to_reg" loading={m.isPending}>
              Create account
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
