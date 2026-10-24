// Single source of truth for supported languages. Add a language here (and
// nowhere else) to make it appear in the API and every page.

export type LanguageConfig = {
  code: string; // ISO 639 code used across the API
  name: string;
  speechRecognition: { supported: boolean; locale?: string }; // spoken INPUT
  translation: boolean; // can be a translation TARGET
  textToSpeech: { supported: boolean; locale?: string; cloud?: boolean }; // spoken OUTPUT; cloud = server-made audio (no phone voice exists)
};

export const LANGUAGES: LanguageConfig[] = [
  {
    code: "en",
    name: "English",
    speechRecognition: { supported: true, locale: "en-NG" },
    translation: true,
    textToSpeech: { supported: true, locale: "en-NG" },
  },
  {
    code: "fr",
    name: "French",
    speechRecognition: { supported: true, locale: "fr-FR" },
    translation: true,
    textToSpeech: { supported: true, locale: "fr-FR" },
  },
  {
    code: "es",
    name: "Spanish",
    speechRecognition: { supported: true, locale: "es-ES" },
    translation: true,
    textToSpeech: { supported: true, locale: "es-ES" },
  },
  // Hausa, Yoruba and Igbo: phones have no voice for them, so spoken output is made on the server
  // (Nigerian English voice driven by phonetic markup). Hearing them is not supported by phones yet.
  { code: "yo", name: "Yoruba", speechRecognition: { supported: false }, translation: true, textToSpeech: { supported: true, locale: "en-NG", cloud: true } },
  { code: "ha", name: "Hausa", speechRecognition: { supported: false }, translation: true, textToSpeech: { supported: true, locale: "en-NG", cloud: true } },
  { code: "ig", name: "Igbo", speechRecognition: { supported: false }, translation: true, textToSpeech: { supported: true, locale: "en-NG", cloud: true } },
  {
    code: "ibb",
    name: "Ibibio",
    // Browsers and mainstream engines do not recognise or speak Ibibio yet.
    // Flip these when a provider is connected.
    speechRecognition: { supported: false },
    translation: true,
    textToSpeech: { supported: false },
  },
];

export const getLanguage = (code: string) =>
  LANGUAGES.find((l) => l.code === code.toLowerCase());

export type PairCheck =
  | { ok: true }
  | { ok: false; code: "UNSUPPORTED_LANGUAGE" | "SAME_LANGUAGE"; message: string };

/** Validates an input -> output pair for translation. */
export function checkTranslationPair(source: string, target: string): PairCheck {
  const s = getLanguage(source);
  const t = getLanguage(target);
  if (!s || !t) {
    return { ok: false, code: "UNSUPPORTED_LANGUAGE", message: "Language not supported" };
  }
  if (s.code === t.code) {
    return { ok: false, code: "SAME_LANGUAGE", message: "Input and output languages are the same" };
  }
  if (!t.translation) {
    return { ok: false, code: "UNSUPPORTED_LANGUAGE", message: `Translation into ${t.name} is not available` };
  }
  return { ok: true };
}
