import { useSyncExternalStore } from "react";

export type Segment = { id: string; original: string; translated: string; t: number };
export type Session = {
  id: string;
  title: string;
  context: string;
  startedAt: number;
  durationSec: number;
  from: string;
  to: string;
  segments: Segment[];
};
export type User = { name: string; email: string; organization?: string; role?: string };
export type Settings = {
  inputLang: string;
  outputLang: string;
  audioOutput: boolean;
  autoPlay: boolean;
  playbackRate: number;
  preferHeadphones: boolean;
  textSize: "default" | "large" | "xl";
  subtitleSize: number;
  highContrast: boolean;
  reducedMotion: boolean;
  notifyEmail: boolean;
  notifyProduct: boolean;
  saveHistory: boolean;
  retention: "7" | "30" | "90" | "forever";
  theme: "light" | "dark" | "system";
  compactSidebar: boolean;
};

type State = { user: User | null; onboarded: boolean; sessions: Session[]; settings: Settings };

export const defaultSettings: Settings = {
  inputLang: "en",
  outputLang: "fr",
  audioOutput: true,
  autoPlay: true,
  playbackRate: 1,
  preferHeadphones: false,
  textSize: "default",
  subtitleSize: 20,
  highContrast: false,
  reducedMotion: false,
  notifyEmail: true,
  notifyProduct: false,
  saveHistory: true,
  retention: "30",
  theme: "light",
  compactSidebar: false,
};

// Sessions are real: they are created by listening on this device, never pre-filled.
const KEY = "voiceverse:v1";
let state: State = { user: null, onboarded: false, sessions: [], settings: defaultSettings };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state = { ...state, ...p, settings: { ...defaultSettings, ...p.settings } };
    }
  } catch {}
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function setState(fn: (s: State) => Partial<State>) {
  load();
  state = { ...state, ...fn(state) };
  persist();
  listeners.forEach((l) => l());
}

const serverState = state;
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => { load(); return sel(state); },
    () => sel(serverState),
  );
}

export const actions = {
  signIn: (user: User) => setState(() => ({ user })),
  signOut: () => setState(() => ({ user: null })),
  completeOnboarding: () => setState(() => ({ onboarded: true })),
  updateUser: (u: Partial<User>) => setState((s) => ({ user: s.user ? { ...s.user, ...u } : s.user })),
  updateSettings: (p: Partial<Settings>) => setState((s) => ({ settings: { ...s.settings, ...p } })),
  addSession: (sess: Session) => setState((s) => ({ sessions: [sess, ...s.sessions] })),
  deleteSession: (id: string) => setState((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
  clearSessions: () => setState(() => ({ sessions: [] })),
  /** Applies the user's retention choice by dropping sessions older than it. */
  pruneExpired: () => setState((s) => {
    if (s.settings.retention === "forever") return {};
    const cutoff = Date.now() - Number(s.settings.retention) * 86_400_000;
    const kept = s.sessions.filter((x) => x.startedAt >= cutoff);
    return kept.length === s.sessions.length ? {} : { sessions: kept };
  }),
};
