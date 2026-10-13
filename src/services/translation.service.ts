export type GlossaryEntry = { sourceText: string; targetText: string };

export type TranslationResult = {
  text: string;
  // false when nothing could be translated and the original text is returned
  translated: boolean;
  engine: "glossary" | "provider" | "llm" | "usem" | "none";
};

const USEM_DEFAULT_URL =
  "https://ruachhakodesh9331--usem-nmt-translator-web.modal.run";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replace known words/phrases using the glossary (longest phrase first).
 * Only reports `translated: true` when at least one term matched.
 */
export function translateWithGlossary(
  text: string,
  glossary: GlossaryEntry[],
): TranslationResult {
  const entries = [...glossary]
    .filter((e) => e.sourceText.trim() && e.targetText.trim())
    .sort((a, b) => b.sourceText.length - a.sourceText.length);

  let out = text;
  let matched = false;
  for (const e of entries) {
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(e.sourceText.trim())}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    out = out.replace(re, () => {
      matched = true;
      return e.targetText.trim();
    });
  }
  return {
    text: out,
    translated: matched,
    engine: matched ? "glossary" : "none",
  };
}

/**
 * Optional LibreTranslate-compatible provider (TRANSLATE_URL, TRANSLATE_API_KEY).
 * Returns null when not configured or when the call fails, so callers can fall back.
 */
export async function translateWithProvider(
  text: string,
  source: string,
  target: string,
): Promise<TranslationResult | null> {
  const url = process.env.TRANSLATE_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source,
        target,
        format: "text",
        api_key: process.env.TRANSLATE_API_KEY,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { translatedText?: string };
    if (!data.translatedText) return null;
    return { text: data.translatedText, translated: true, engine: "provider" };
  } catch {
    return null;
  }
}

/**
 * Optional LLM provider for languages machine translation does not cover well
 * (e.g. Ibibio). Any OpenAI-compatible chat endpoint works:
 *   LLM_BASE_URL (e.g. https://host/v1), LLM_API_KEY, LLM_MODEL.
 * Glossary terms are passed as hints so approved vocabulary is respected.
 */
export async function translateWithLlm(
  text: string,
  source: string,
  target: string,
  glossary: GlossaryEntry[],
  names: { source: string; target: string },
): Promise<TranslationResult | null> {
  const base = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;
  if (!base || !model) return null;
  const hints = glossary
    .slice(0, 100)
    .map((g) => `${g.sourceText} = ${g.targetText}`)
    .join("\n");
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LLM_API_KEY
          ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              `You translate spoken ${names.source} into ${names.target} for live subtitles. ` +
              `Output only the translation, with no notes or quotes. ` +
              `If you do not know a word, keep it unchanged.` +
              (hints ? `\nApproved vocabulary:\n${hints}` : ""),
          },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const out = data.choices?.[0]?.message?.content?.trim();
    if (!out) return null;
    return { text: out, translated: true, engine: "llm" };
  } catch {
    return null;
  }
}

/** USEM's translation API translates English text into Ibibio. */
export async function translateWithUsem(text: string): Promise<TranslationResult | null> {
  const base = process.env.USEM_TRANSLATION_URL?.trim() || USEM_DEFAULT_URL;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { translation?: unknown };
    const out = typeof data.translation === "string" ? data.translation.trim() : "";
    if (!out) return null;
    return { text: out, translated: true, engine: "usem" };
  } catch {
    return null;
  }
}

const cache = new Map<string, TranslationResult>();
const CACHE_MAX = 2000;

/**
 * Order: LLM, then HTTP provider, then glossary. Whichever is configured and
 * succeeds wins; the glossary is the always-available fallback.
 * Failed lookups are not cached.
 */
export async function translate(
  text: string,
  source: string,
  target: string,
  glossary: GlossaryEntry[],
  names: { source: string; target: string } = { source, target },
): Promise<TranslationResult> {
  if (source === target) return { text, translated: false, engine: "none" };

  const key = `${source}>${target}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const result =
    (source === "en" && target === "ibb" ? await translateWithUsem(text) : null) ??
    (await translateWithLlm(text, source, target, glossary, names)) ??
    (await translateWithProvider(text, source, target)) ??
    translateWithGlossary(text, glossary);

  if (result.translated) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }
  return result;
}

export const translationProviderConfigured = (source?: string, target?: string) =>
  Boolean(
    (source === undefined && target === undefined) ||
      (source === "en" && target === "ibb") ||
    (process.env.LLM_BASE_URL && process.env.LLM_MODEL) ||
      process.env.TRANSLATE_URL,
  );
