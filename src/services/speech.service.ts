import { PRONUNCIATION_LANGS, sentenceToSsml, type PronLang } from "@/services/pronunciation";
import { spitchAvailable, spitchConfigured, spitchSpeaks, speakWithSpitch } from "@/services/spitch.service";

export type SpeechVoice = "female" | "male";

export class SpeechUnavailable extends Error {}
export class SpeechUnsupported extends Error {}

const AUDIO_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
export const MAX_SPEECH_CHARS = 1000;

type VoiceSet = { locale: string; female: string; male: string };

// Azure has no Hausa, Yoruba or Igbo voices. Those are read by the Nigerian English voice from phonetic
// markup (see pronunciation.ts), which keeps the Nigerian accent and rhythm.
const NIGERIAN: VoiceSet = { locale: "en-NG", female: "en-NG-EzinneNeural", male: "en-NG-AbeoNeural" };
const VOICES: Record<string, VoiceSet> = {
  en: NIGERIAN,
  yo: NIGERIAN,
  ha: NIGERIAN,
  ig: NIGERIAN,
  fr: { locale: "fr-FR", female: "fr-FR-DeniseNeural", male: "fr-FR-HenriNeural" },
  es: { locale: "es-ES", female: "es-ES-ElviraNeural", male: "es-ES-AlvaroNeural" },
};

export const speechLanguages = Object.keys(VOICES);
/** Languages whose speech is built from phonetic markup instead of plain text. */
export const cloudOnlyLanguages = PRONUNCIATION_LANGS;

const azureSpeechConfigured = () => Boolean(process.env.AZURE_SPEECH_KEY?.trim() && process.env.AZURE_SPEECH_REGION?.trim());
/** Speech can be made when Azure is set up, or (for Hausa, Yoruba, Igbo) when Spitch is. */
export const speechConfigured = () => azureSpeechConfigured() || spitchAvailable();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
// eslint-disable-next-line no-control-regex
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/\s+/g, " ").trim();

export function buildSsml(text: string, language: string, voice: SpeechVoice, rate: number, phonetic = true): string {
  const set = VOICES[language];
  if (!set) throw new SpeechUnsupported(language);
  const percent = Math.round((Math.max(0.5, Math.min(rate, 2)) - 1) * 100);
  const body =
    phonetic && PRONUNCIATION_LANGS.includes(language) ? sentenceToSsml(clean(text), language as PronLang) : esc(clean(text));
  return (
    `<speak version='1.0' xml:lang='${set.locale}' xmlns='http://www.w3.org/2001/10/synthesis'>` +
    `<voice xml:lang='${set.locale}' name='${set[voice]}'><prosody rate='${percent >= 0 ? "+" : ""}${percent}%'>${body}</prosody></voice></speak>`
  );
}

// Repeated sentences (greetings, headings) are common: keep recent audio instead of paying twice.
const cache = new Map<string, Buffer>();
let cacheBytes = 0;
const CACHE_LIMIT_BYTES = 24 * 1024 * 1024;

function remember(key: string, audio: Buffer) {
  cache.set(key, audio);
  cacheBytes += audio.length;
  while (cacheBytes > CACHE_LIMIT_BYTES && cache.size) {
    const oldest = cache.keys().next().value!;
    cacheBytes -= cache.get(oldest)!.length;
    cache.delete(oldest);
  }
}

async function post(ssml: string): Promise<{ status: number; audio?: Buffer }> {
  const key = process.env.AZURE_SPEECH_KEY!.trim();
  const region = process.env.AZURE_SPEECH_REGION!.trim();
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": AUDIO_FORMAT,
      "User-Agent": "voiceverse",
    },
    body: ssml,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { status: res.status };
  const audio = Buffer.from(await res.arrayBuffer());
  return { status: res.status, audio: audio.length ? audio : undefined };
}

export type Spoken = {
  audio: Buffer;
  /** Who actually made the audio. */
  engine: "spitch" | "azure";
  /** True when the native voice was wanted and could not be used (out of credit, busy, down): not the customer's fault. */
  fellBack: boolean;
};

/** MP3 audio for a sentence. Throws SpeechUnsupported for a language with no voice, SpeechUnavailable on failure. */
export async function synthesize(
  text: string,
  language: string,
  voice: SpeechVoice = "female",
  rate = 1,
): Promise<Buffer> {
  return (await synthesizeDetailed(text, language, voice, rate)).audio;
}

/**
 * Like synthesize, and says which engine spoke. `native: false` asks for the standard (Azure) voice on purpose,
 * for sessions whose host did not pay for the local voice; that is not a fallback.
 */
export async function synthesizeDetailed(
  text: string,
  language: string,
  voice: SpeechVoice = "female",
  rate = 1,
  opts: { native?: boolean } = {},
): Promise<Spoken> {
  if (!VOICES[language]) throw new SpeechUnsupported(language);
  if (!speechConfigured()) throw new SpeechUnavailable("not configured");
  const spoken = clean(text);
  if (!spoken) throw new SpeechUnavailable("empty");

  const wantNative = opts.native !== false && spitchSpeaks(language);
  const cacheKey = `${wantNative ? "n" : "s"}|${language}|${voice}|${rate}|${spoken}`;
  const hit = cache.get(cacheKey);
  if (hit) return { audio: hit, engine: wantNative ? "spitch" : "azure", fellBack: false };

  // Hausa, Yoruba and Igbo: native Spitch voices first. They are the best, so they are the ones worth keeping.
  if (wantNative && (spitchAvailable() || spitchConfigured())) {
    if (spitchAvailable()) {
      const native = await speakWithSpitch(spoken, language, voice, rate);
      if (native) {
        remember(cacheKey, native);
        return { audio: native, engine: "spitch", fellBack: false };
      }
    }
    // Spitch could not answer (out of credit, busy, down): fall through to the Azure voice. That audio is not
    // kept, so the sentence is spoken natively as soon as Spitch is back.
    return { audio: await azureSynthesize(spoken, language, voice, rate, false), engine: "azure", fellBack: true };
  }
  return { audio: await azureSynthesize(spoken, language, voice, rate, true, cacheKey), engine: "azure", fellBack: false };
}

/** The Azure voice: phonetic markup for Hausa, Yoruba and Igbo, plain text otherwise. */
async function azureSynthesize(
  spoken: string,
  language: string,
  voice: SpeechVoice,
  rate: number,
  keep: boolean,
  cacheKey = "",
): Promise<Buffer> {
  if (!azureSpeechConfigured()) throw new SpeechUnavailable("azure not configured");

  // First the phonetic version. If Azure rejects that markup (HTTP 400), say it plainly instead of failing.
  const attempts = PRONUNCIATION_LANGS.includes(language) ? [true, false] : [false];
  for (const phonetic of attempts) {
    const ssml = buildSsml(spoken, language, voice, rate, phonetic);
    for (let tries = 0; tries < 2; tries++) {
      try {
        const r = await post(ssml);
        if (r.audio) {
          if (keep) remember(cacheKey, r.audio);
          return r.audio;
        }
        if (r.status === 400) break; // bad markup: go to the plain version, retrying will not help
        if (![429, 500, 502, 503, 504].includes(r.status)) throw new SpeechUnavailable(`azure ${r.status}`);
      } catch (e) {
        if (e instanceof SpeechUnavailable) throw e;
        // network error or timeout: one more try
      }
    }
  }
  throw new SpeechUnavailable("azure failed");
}
