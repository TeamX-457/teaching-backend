import type { TranslationResult } from "@/services/translation.service";

/**
 * Spitch: Nigerian-language speech and translation (https://docs.spitch.app).
 * Its voices speak Hausa, Yoruba and Igbo natively, and its translation is far better than general engines
 * for short Igbo and Yoruba phrases. Settings: SPITCH_API_KEY (required), SPITCH_MAX_CONCURRENT (default 3).
 *
 * It is billed per use and the account has limits, so every call here can fail safely: the callers fall back to
 * Azure. When credit runs out or the key is rejected, Spitch is skipped for a while instead of retried each time.
 */

const BASE = "https://api.spitch.app";

export type SpitchLang = "en" | "yo" | "ha" | "ig";
const LANGS = new Set<string>(["en", "yo", "ha", "ig"]);
export const spitchSupports = (code: string) => LANGS.has(code);

// Voices are named, not tied to a language. Two per gender exist for each; these are the first of each.
const VOICES: Record<string, { female: string; male: string }> = {
  yo: { female: "sade", male: "segun" },
  ha: { female: "amina", male: "hasan" },
  ig: { female: "ngozi", male: "obinna" },
};
export const spitchSpeaks = (code: string) => code in VOICES;

export const spitchConfigured = () => Boolean(process.env.SPITCH_API_KEY?.trim());

// ───────────── Safety: pause after "payment required" or "unauthorised"; limit parallel calls ─────────────

let pausedUntil = 0;
const PAUSE_MS = 10 * 60_000; // out of credit or bad key: nothing is gained by asking again every sentence
const BUSY_PAUSE_MS = 20_000; // rate limited

export const spitchAvailable = () => spitchConfigured() && Date.now() >= pausedUntil;
/** For tests. */
export const resetSpitch = () => { pausedUntil = 0; };

/** Spitch limits calls per account (3 at once on the starting tier). Extra calls wait their turn. */
class Gate {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly max: () => number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max()) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
const gate = new Gate(() => Math.max(1, Number(process.env.SPITCH_MAX_CONCURRENT) || 3));

async function post(path: string, body: unknown, timeoutMs: number): Promise<Response | null> {
  if (!spitchAvailable()) return null;
  return gate.run(async () => {
    try {
      const res = await fetch(BASE + path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SPITCH_API_KEY!.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 401 || res.status === 402) pausedUntil = Date.now() + PAUSE_MS;
      else if (res.status === 429) pausedUntil = Date.now() + BUSY_PAUSE_MS;
      return res.ok ? res : null;
    } catch {
      return null; // network error or timeout
    }
  });
}

// ───────────── Translation ─────────────

/** Translates between English, Yoruba, Hausa and Igbo. Null when unavailable, so Azure can take over. */
export async function translateWithSpitch(text: string, source: string, target: string): Promise<TranslationResult | null> {
  if (!spitchSupports(source) || !spitchSupports(target) || source === target) return null;
  const res = await post("/v1/translate", { text, source, target }, 15_000);
  if (!res) return null;
  try {
    const data = (await res.json()) as { text?: unknown };
    const out = typeof data.text === "string" ? data.text.trim() : "";
    return out ? { text: out, translated: true, engine: "spitch" } : null;
  } catch {
    return null;
  }
}

// ───────────── Speech ─────────────

/** Speed range Spitch accepts. */
export const clampSpeed = (rate: number) => Math.min(1.2, Math.max(0.7, rate));

/**
 * MP3 audio spoken natively in Hausa, Yoruba or Igbo. Null when unavailable.
 * For Yoruba, Spitch adds the tone marks itself before speaking.
 */
export async function speakWithSpitch(
  text: string,
  language: string,
  voice: "female" | "male",
  rate: number,
): Promise<Buffer | null> {
  const set = VOICES[language];
  if (!set) return null;
  const res = await post(
    "/v1/speech",
    { text, language, voice: set[voice], speed: clampSpeed(rate), format: "mp3", bitrate: "64k" },
    12_000,
  );
  if (!res) return null;
  try {
    const audio = Buffer.from(await res.arrayBuffer());
    return audio.length ? audio : null;
  } catch {
    return null;
  }
}

// ───────────── Speech to text ─────────────

const AUDIO_EXT: Record<string, string> = { "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a" };

/**
 * What was said in [audio] (wav, mp3, m4a or ogg, up to 25 MB), understood as English, Yoruba, Hausa or Igbo.
 * Null when unavailable (not set up, out of credit, rate limited, network trouble), so callers can say so honestly.
 */
export async function transcribeWithSpitch(audio: Buffer, contentType: string, language: string): Promise<string | null> {
  if (!spitchSupports(language) || !spitchAvailable() || audio.length === 0) return null;
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  const ext = AUDIO_EXT[type] ?? "wav";
  return gate.run(async () => {
    try {
      const form = new FormData();
      form.append("content", new Blob([new Uint8Array(audio)], { type: AUDIO_EXT[type] ? type : "audio/wav" }), `speech.${ext}`);
      form.append("language", language);
      const res = await fetch(BASE + "/v1/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SPITCH_API_KEY!.trim()}` },
        body: form,
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status === 401 || res.status === 402) pausedUntil = Date.now() + PAUSE_MS;
      else if (res.status === 429) pausedUntil = Date.now() + BUSY_PAUSE_MS;
      if (!res.ok) return null;
      const data = (await res.json()) as { text?: unknown };
      return typeof data.text === "string" ? data.text.trim() : null;
    } catch {
      return null;
    }
  });
}
