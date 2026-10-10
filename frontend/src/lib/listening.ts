import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type LangCfg } from "./api";
import type { Segment } from "./store";

export type Stage = "ready" | "listening" | "processing" | "translating" | "speaking" | "paused" | "completed" | "error";

export const STAGE_LABEL: Record<Stage, string> = {
  ready: "Ready", listening: "Listening", processing: "Processing", translating: "Translating",
  speaking: "Speaking", paused: "Paused", completed: "Completed", error: "Needs attention",
};

/** User-facing problems. Technical detail never reaches the screen. */
export type Problem = { key: string; title: string; body: string; fatal: boolean };
const PROBLEMS: Record<string, Omit<Problem, "key">> = {
  denied: { title: "Microphone access is blocked", body: "Allow the microphone in your browser's address bar, then press Resume.", fatal: true },
  nomic: { title: "No microphone found", body: "Connect or enable a microphone, then try again.", fatal: true },
  unsupported: { title: "Live listening isn't supported in this browser", body: "Open Voice Verse in Chrome or Edge on your phone or computer.", fatal: true },
  language: { title: "This language can't be recognised here", body: "Choose a different input language.", fatal: true },
  offline: { title: "You're offline", body: "Check your connection. Listening will resume when you're back online.", fatal: false },
  nospeech: { title: "No speech detected", body: "Move closer to the speaker or raise the microphone volume.", fatal: false },
  translation: { title: "Translation is unavailable right now", body: "Showing the original words. It will retry on the next sentence.", fatal: false },
  notranslator: { title: "Translation isn't connected yet", body: "Subtitles work. Translated text appears once a translation service is connected.", fatal: false },
  ratelimit: { title: "Too many requests", body: "Translation will resume in a moment.", fatal: false },
  tts: { title: "Spoken output failed", body: "You can keep reading the text.", fatal: false },
};
const problem = (key: string): Problem => ({ key, ...PROBLEMS[key]! });

type SR = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
};
const getEngine = (): (new () => SR) | null =>
  typeof window === "undefined" ? null : ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);

export const speechSupported = () => getEngine() !== null;

/**
 * Microphone -> recognition (final sentences only reach `onFinal`).
 * Auto-restarts after browser-imposed silence timeouts while `running`.
 */
export function useRecognizer(opts: {
  locale: string | undefined;
  onPartial: (t: string) => void;
  onFinal: (t: string) => void;
  onProblem: (p: Problem) => void;
}) {
  const rec = useRef<SR | null>(null);
  const running = useRef(false);
  const o = useRef(opts);
  o.current = opts;

  const stop = useCallback(() => {
    running.current = false;
    try { rec.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const start = useCallback(() => {
    const Engine = getEngine();
    if (!Engine) { o.current.onProblem(problem("unsupported")); return false; }
    if (!navigator.onLine) { o.current.onProblem(problem("offline")); return false; }
    const r = new Engine();
    r.continuous = true;
    r.interimResults = true;
    r.lang = o.current.locale || "en-US";
    r.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const text = String(ev.results[i][0].transcript).trim();
        if (!text) continue;
        if (ev.results[i].isFinal) o.current.onFinal(text); else o.current.onPartial(text);
      }
    };
    r.onerror = (ev) => {
      const e = ev.error as string;
      if (e === "not-allowed" || e === "service-not-allowed") { running.current = false; o.current.onProblem(problem("denied")); }
      else if (e === "audio-capture") { running.current = false; o.current.onProblem(problem("nomic")); }
      else if (e === "language-not-supported") { running.current = false; o.current.onProblem(problem("language")); }
      else if (e === "network") o.current.onProblem(problem("offline"));
      else if (e === "no-speech") o.current.onProblem(problem("nospeech"));
    };
    r.onend = () => { if (running.current) { try { r.start(); } catch { /* restarting too fast; next end retries */ } } };
    rec.current = r;
    running.current = true;
    try { r.start(); } catch { return false; }
    return true;
  }, []);

  useEffect(() => () => { running.current = false; try { rec.current?.stop(); } catch { /* noop */ } }, []);
  return { start, stop };
}

/** Spoken output with a short queue so continuous speech never builds a backlog. */
export function useSpeaker(opts: { enabled: boolean; locale: string | undefined; rate: number; onProblem: (p: Problem) => void }) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  const o = useRef(opts);
  o.current = opts;

  const next = useCallback(() => {
    if (busy.current || !queue.current.length || typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(queue.current.shift()!);
    if (o.current.locale) u.lang = o.current.locale;
    u.rate = o.current.rate;
    busy.current = true;
    setSpeaking(true);
    u.onend = () => { busy.current = false; setSpeaking(false); next(); };
    u.onerror = () => { busy.current = false; setSpeaking(false); o.current.onProblem(problem("tts")); };
    speechSynthesis.speak(u);
  }, []);

  const say = useCallback((text: string) => {
    if (!o.current.enabled || typeof speechSynthesis === "undefined") return;
    queue.current.push(text);
    if (queue.current.length > 2) queue.current.splice(0, queue.current.length - 2);
    next();
  }, [next]);

  const pause = useCallback(() => { speechSynthesis.pause(); setPaused(true); }, []);
  const resume = useCallback(() => { speechSynthesis.resume(); setPaused(false); next(); }, [next]);
  const stop = useCallback(() => {
    queue.current = []; busy.current = false;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setSpeaking(false); setPaused(false);
  }, []);
  useEffect(() => () => stop(), [stop]);
  return { say, pause, resume, stop, speaking, paused };
}

type Status = "idle" | "listening" | "paused" | "completed" | "error";

/** The complete solo-listening session: recognise -> translate -> display -> speak. */
export function useListening(cfg: { from: string; to: string; langs: LangCfg[]; audio: boolean; rate: number }) {
  const { from, to, langs } = cfg;
  const toCfg = langs.find((l) => l.code === to);
  const fromCfg = langs.find((l) => l.code === from);
  const translating = from !== to;

  const [status, setStatus] = useState<Status>("idle");
  const [problemState, setProblem] = useState<Problem | null>(null);
  const [partial, setPartial] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [pending, setPending] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef(0);
  const listenedMs = useRef(0);
  const resumedAt = useRef<number | null>(null);
  const noticed = useRef(false);

  const speaker = useSpeaker({
    enabled: cfg.audio && translating && !!toCfg?.textToSpeech.supported,
    locale: toCfg?.textToSpeech.locale, rate: cfg.rate,
    onProblem: setProblem,
  });

  const onFinal = useCallback(async (text: string) => {
    const id = crypto.randomUUID();
    const t = Math.round((Date.now() - t0.current) / 1000);
    setPartial("");
    setSegments((s) => [...s, { id, original: text, translated: "", t }]);
    if (!translating) return;
    setPending((n) => n + 1);
    try {
      const r = await api.translate({ text, source: from, target: to });
      if (r.translated) {
        setSegments((s) => s.map((x) => (x.id === id ? { ...x, translated: r.text } : x)));
        speaker.say(r.text);
        setProblem((p) => (p && (p.key === "translation" || p.key === "ratelimit") ? null : p));
      } else if (r.reason === "no_provider") {
        if (!noticed.current) { noticed.current = true; setProblem(problem("notranslator")); }
      } else setProblem(problem("translation"));
    } catch (e) {
      setProblem(problem(e instanceof ApiError && e.status === 429 ? "ratelimit" : navigator.onLine ? "translation" : "offline"));
    } finally {
      setPending((n) => n - 1);
    }
  }, [from, to, translating, speaker]);

  const recognizer = useRecognizer({
    locale: fromCfg?.speechRecognition.locale,
    onPartial: setPartial,
    onFinal,
    onProblem: (p) => { setProblem(p); if (p.fatal) { setStatus("error"); closeClock(); } },
  });

  function closeClock() {
    if (resumedAt.current) { listenedMs.current += Date.now() - resumedAt.current; resumedAt.current = null; }
  }
  const openClock = () => { resumedAt.current = Date.now(); };

  const start = useCallback(() => {
    setProblem(null);
    if (!t0.current) t0.current = Date.now();
    if (recognizer.start()) { setStatus("listening"); openClock(); }
    else setStatus("error");
  }, [recognizer]);
  const pause = useCallback(() => { recognizer.stop(); speaker.stop(); closeClock(); setStatus("paused"); setPartial(""); }, [recognizer, speaker]);
  const stop = useCallback(() => { recognizer.stop(); speaker.stop(); closeClock(); setStatus("completed"); setPartial(""); }, [recognizer, speaker]);

  useEffect(() => {
    if (status !== "listening") return;
    const id = setInterval(() => setElapsed(Math.round((listenedMs.current + (resumedAt.current ? Date.now() - resumedAt.current : 0)) / 1000)), 500);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    const off = () => { if (status === "listening") setProblem(problem("offline")); };
    const on = () => setProblem((p) => (p?.key === "offline" ? null : p));
    window.addEventListener("offline", off); window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); };
  }, [status]);

  const stage: Stage = useMemo(() => {
    if (status === "error") return "error";
    if (status === "completed") return pending > 0 ? "processing" : "completed";
    if (status === "paused") return "paused";
    if (status === "idle") return "ready";
    if (pending > 0) return translating ? "translating" : "processing";
    return speaker.speaking ? "speaking" : "listening";
  }, [status, pending, translating, speaker.speaking]);

  const durationSec = Math.round((listenedMs.current + (resumedAt.current ? Date.now() - resumedAt.current : 0)) / 1000);

  return { stage, status, problem: problemState, dismissProblem: () => setProblem(null), partial, segments, pending, elapsed, durationSec, startedAt: t0.current, start, pause, stop, speaker };
}
