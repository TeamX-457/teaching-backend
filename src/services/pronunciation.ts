/**
 * Pronunciation for Yoruba, Hausa and Igbo.
 *
 * Azure has no voices for these languages. Its Nigerian English voices read unknown spellings letter by
 * letter or as English (for example "kpa" is spelled out). These orthographies are close to phonemic, so we
 * convert each word to IPA with rules, and give Yoruba and Igbo tone marks as pitch, then let the Nigerian
 * English voice say it. That keeps the Nigerian accent and rhythm and fixes the sounds.
 *
 * Only IPA symbols that Azure's Nigerian voice was measured to render are used (see tests). Sounds it cannot
 * make are replaced by the nearest one it can: glottal stop is dropped, ejectives become plain stops.
 */

export type PronLang = "yo" | "ha" | "ig";
export const PRONUNCIATION_LANGS: readonly string[] = ["yo", "ha", "ig"];

type Tone = "H" | "M" | "L";
type Unit =
  | { k: "C"; ipa: string }
  | { k: "V"; ipa: string; tone?: Tone | undefined }
  | { k: "N"; ipa: string; tone?: Tone | undefined }; // syllabic nasal: its own syllable
export type Syllable = { ipa: string; tone?: Tone | undefined; weight: number };

const GRAVE = "̀";
const ACUTE = "́";
const MACRON = "̄";
const DOT_BELOW = "̣";
const DOT_ABOVE = "̇";

type G = { ch: string; tone?: Tone | undefined; dotBelow: boolean; dotAbove: boolean };

/** Letters with their combining marks, lower-cased. */
function graphemes(word: string): G[] {
  const out: G[] = [];
  for (const c of word.normalize("NFD").toLowerCase()) {
    if (c === GRAVE || c === ACUTE || c === MACRON || c === DOT_BELOW || c === DOT_ABOVE) {
      const last = out[out.length - 1];
      if (!last) continue;
      if (c === GRAVE) last.tone = "L";
      else if (c === ACUTE) last.tone = "H";
      else if (c === MACRON) last.tone = "M";
      else if (c === DOT_BELOW) last.dotBelow = true;
      else last.dotAbove = true;
    } else if (/\p{M}/u.test(c)) {
      continue; // any other mark: ignore
    } else {
      out.push({ ch: c, dotBelow: false, dotAbove: false });
    }
  }
  return out;
}

const isVowelLetter = (g: G | undefined, vowels: string) => !!g && vowels.includes(g.ch) && g.ch.length === 1;

// ───────────────────────── Yoruba ─────────────────────────

const YO_VOWELS = "aeiou";
const YO_C: Record<string, string> = {
  b: "b", d: "d", f: "f", g: "ɡ", h: "h", j: "dʒ", k: "k", l: "l", m: "m", n: "n",
  p: "kp", // Yoruba "p" is the labial-velar kp
  r: "ɾ", s: "s", t: "t", w: "w", y: "j",
};

function yorubaUnits(gs: G[]): Unit[] {
  const units: Unit[] = [];
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i]!;
    const next = gs[i + 1];
    if (YO_VOWELS.includes(g.ch)) {
      let ipa: string;
      if (g.ch === "a") ipa = "ɑ";
      else if (g.ch === "e") ipa = g.dotBelow ? "ɛ" : "e";
      else if (g.ch === "o") ipa = g.dotBelow ? "ɔ" : "o";
      else ipa = g.ch;
      // A vowel followed by n (and no vowel after it) is nasalised; the n is not a separate sound.
      if (next?.ch === "n" && !isVowelLetter(gs[i + 2], YO_VOWELS)) {
        units.push({ k: "V", ipa: ipa + "n", tone: g.tone });
        i++;
      } else {
        units.push({ k: "V", ipa, tone: g.tone });
      }
    } else if (g.ch === "g" && next?.ch === "b") {
      units.push({ k: "C", ipa: "ɡb" });
      i++;
    } else if (g.ch === "s") {
      units.push({ k: "C", ipa: g.dotBelow ? "ʃ" : "s" });
    } else if ((g.ch === "m" || g.ch === "n") && !isVowelLetter(next, YO_VOWELS)) {
      units.push({ k: "N", ipa: g.ch, tone: g.tone });
    } else if (YO_C[g.ch]) {
      units.push({ k: "C", ipa: YO_C[g.ch]! });
    }
    // anything else (digits, stray letters): ignored here; handled by the caller
  }
  return units;
}

// ───────────────────────── Igbo ─────────────────────────

const IG_VOWELS = "aeiou";
const IG_C: Record<string, string> = {
  b: "b", d: "d", f: "f", g: "ɡ", h: "h", j: "dʒ", k: "k", l: "l", m: "m", n: "n", p: "p",
  r: "ɾ", s: "s", t: "t", v: "v", w: "w", y: "j", z: "z",
};

function igboUnits(gs: G[]): Unit[] {
  const units: Unit[] = [];
  const two = (i: number) => gs[i]!.ch + (gs[i + 1]?.ch ?? "");
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i]!;
    const next = gs[i + 1];
    if (IG_VOWELS.includes(g.ch)) {
      let ipa: string;
      if (g.ch === "a") ipa = "ɑ";
      else if (g.ch === "i") ipa = g.dotBelow ? "ɪ" : "i";
      else if (g.ch === "o") ipa = g.dotBelow ? "ɔ" : "o";
      else if (g.ch === "u") ipa = g.dotBelow ? "ʊ" : "u";
      else ipa = "e";
      units.push({ k: "V", ipa, tone: g.tone });
      continue;
    }
    const d = two(i);
    const digraph: Record<string, string> = {
      ch: "tʃ", gb: "ɡb", gh: "ɣ", gw: "ɡw", kp: "kp", kw: "kw", ny: "ɲ", nw: "ŋw", sh: "ʃ",
    };
    if (g.ch === "n" && g.dotAbove) { // ṅ
      units.push({ k: "C", ipa: "ŋ" });
    } else if (next && digraph[d]) {
      units.push({ k: "C", ipa: digraph[d]! });
      i++;
    } else if ((g.ch === "m" || g.ch === "n") && !isVowelLetter(next, IG_VOWELS)) {
      units.push({ k: "N", ipa: g.ch, tone: g.tone });
    } else if (IG_C[g.ch]) {
      units.push({ k: "C", ipa: IG_C[g.ch]! });
    }
  }
  return units;
}

// ───────────────────────── Hausa ─────────────────────────

const HA_VOWELS = "aeiou";
const HA_C: Record<string, string> = {
  b: "b", "ɓ": "ɓ", c: "tʃ", d: "d", "ɗ": "ɗ", f: "f", g: "ɡ", h: "h", j: "dʒ", k: "k", "ƙ": "k",
  l: "l", m: "m", n: "n", r: "ɾ", s: "s", t: "t", w: "w", y: "j", "ƴ": "j", z: "z",
};

/** Hausa is written without tone marks, so it is returned as one phonetic string per word. */
function hausaIpa(gs: G[]): string {
  let out = "";
  const digraph: Record<string, string> = { sh: "ʃ", ts: "ts", ky: "kj", gy: "ɡj", kw: "kw", gw: "ɡw", fy: "fj" };
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i]!;
    const next = gs[i + 1];
    if (HA_VOWELS.includes(g.ch)) {
      const v = g.ch === "a" ? "ɑ" : g.ch;
      if (next?.ch === g.ch) { out += v + "ː"; i++; } // a doubled vowel letter is a long vowel
      else out += v;
    } else if (next && digraph[g.ch + next.ch]) {
      out += digraph[g.ch + next.ch]!;
      i++;
    } else if (HA_C[g.ch]) {
      out += HA_C[g.ch]!;
    }
    // ʼ (glottal stop) and anything else: dropped, the voice cannot make a glottal stop
  }
  return out;
}

// ───────────────────────── Syllables and tone ─────────────────────────

export function syllabify(units: Unit[]): Syllable[] {
  const syl: Syllable[] = [];
  let onset = "";
  for (const u of units) {
    if (u.k === "C") {
      onset += u.ipa;
    } else if (u.k === "V") {
      syl.push({ ipa: onset + u.ipa, tone: u.tone, weight: onset ? 1 : 0.8 });
      onset = "";
    } else {
      if (onset) { syl.push({ ipa: onset, weight: 0.4 }); onset = ""; }
      syl.push({ ipa: u.ipa, tone: u.tone, weight: 0.8 });
    }
  }
  if (onset) { // trailing consonants: fold into the last syllable
    if (syl.length) syl[syl.length - 1]!.ipa += onset;
    else syl.push({ ipa: onset, weight: 1 });
  }
  return syl;
}

// Measured: +-4 semitones gave a 14-semitone spread over a sentence (too wide); +-3 is clearly tonal yet natural.
const SEMITONES: Record<Tone, number> = { H: 3, M: 0, L: -3 };
const st = (n: number) => `${n >= 0 ? "+" : ""}${n}st`;

/** Pitch contour with a plateau on each syllable, so tones stay distinct inside one word. */
export function toneContour(syls: Syllable[]): string | null {
  if (!syls.some((s) => s.tone === "H" || s.tone === "L")) return null; // no tone marks: leave natural intonation
  const total = syls.reduce((n, s) => n + s.weight, 0);
  const points: { at: number; value: string }[] = [];
  let acc = 0;
  for (const s of syls) {
    const from = (acc / total) * 100;
    acc += s.weight;
    const to = (acc / total) * 100;
    const value = st(SEMITONES[s.tone ?? "M"]);
    const pad = Math.min(8, (to - from) * 0.2);
    points.push({ at: from + pad, value }, { at: to - pad, value });
  }
  // Whole percentages, strictly increasing and inside 0..100.
  let prev = -1;
  return points
    .map((p) => {
      const at = Math.min(100, Math.max(prev + 1, Math.round(p.at)));
      prev = at;
      return `(${at}%,${p.value})`;
    })
    .join(" ");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** SSML for one word, or null when it has no letters we can read in this language. */
export function wordToSsml(word: string, lang: PronLang): string | null {
  const gs = graphemes(word);
  let ipa: string;
  let contour: string | null = null;
  if (lang === "ha") {
    ipa = hausaIpa(gs);
  } else {
    const syls = syllabify(lang === "yo" ? yorubaUnits(gs) : igboUnits(gs));
    ipa = syls.map((s) => s.ipa).join("");
    contour = toneContour(syls);
  }
  if (!ipa) return null;
  const tag = `<phoneme alphabet="ipa" ph="${esc(ipa)}">${esc(word)}</phoneme>`;
  return contour ? `<prosody contour="${contour}">${tag}</prosody>` : tag;
}

const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’ʼ-]*/gu;

/** Converts a sentence to SSML for the Nigerian English voice. Punctuation is kept, so pauses stay natural. */
export function sentenceToSsml(text: string, lang: PronLang): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    out += esc(text.slice(last, m.index));
    const word = m[0];
    // Words with letters outside the language's alphabet (names, English words) are left for the voice.
    const ssml = /[\p{L}]/u.test(word) && !hasForeignLetters(word, lang) ? wordToSsml(word, lang) : null;
    out += ssml ?? esc(word);
    last = (m.index ?? 0) + word.length;
  }
  return out + esc(text.slice(last));
}

const ALPHABET: Record<PronLang, RegExp> = {
  yo: /^[abdefghijklmnoprstuwyṣẹọ]+$/u,
  ha: /^[abɓcdɗefghijkƙlmnorstuwyƴz]+$/u,
  ig: /^[abcdefghijklmnoprstuvwyzịọụṅ]+$/u,
};

/** True for words that cannot be in this language (so English names and loan words are not mangled). */
function hasForeignLetters(word: string, lang: PronLang): boolean {
  const base = word.normalize("NFC").toLowerCase().replace(/[’ʼ'-]/g, "");
  // tone marks are combining marks: strip them (and re-compose dot-below letters) before checking letters
  const letters = base.normalize("NFD").replace(/[̀́̄]/g, "").normalize("NFC");
  return !ALPHABET[lang].test(letters);
}
