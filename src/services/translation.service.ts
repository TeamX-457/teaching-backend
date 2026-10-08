export type GlossaryEntry = { sourceText: string; targetText: string };

export type TranslationResult = {
  text: string;
  // false when nothing could be translated and the original text is returned
  translated: boolean;
  engine: "glossary" | "provider" | "none";
};

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

export async function translate(
  text: string,
  source: string,
  target: string,
  glossary: GlossaryEntry[],
): Promise<TranslationResult> {
  if (source === target) return { text, translated: false, engine: "none" };
  const fromGlossary = translateWithGlossary(text, glossary);
  if (fromGlossary.translated) return fromGlossary;
  const fromProvider = await translateWithProvider(text, source, target);
  return fromProvider ?? { text, translated: false, engine: "none" };
}
