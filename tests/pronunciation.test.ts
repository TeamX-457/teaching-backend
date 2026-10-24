import { describe, expect, it } from "bun:test";
import { sentenceToSsml, syllabify, toneContour, wordToSsml } from "@/services/pronunciation";

/** The IPA string a word is sent with. */
const ipaOf = (word: string, lang: "yo" | "ha" | "ig") => /ph="([^"]*)"/.exec(wordToSsml(word, lang) ?? "")?.[1];

/** Every opening tag is closed in order: the markup Azure receives must be well-formed. */
function wellFormed(ssml: string) {
  const stack: string[] = [];
  for (const m of ssml.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) { if (stack.pop() !== name) return false; } else stack.push(name!);
  }
  return stack.length === 0;
}

describe("Yoruba", () => {
  it("writes sounds, not letters: p is kp, ṣ is sh, gb is one sound", () => {
    expect(ipaOf("pẹ́", "yo")).toBe("kpɛ");
    expect(ipaOf("ṣe", "yo")).toBe("ʃe");
    expect(ipaOf("gbogbo", "yo")).toBe("ɡboɡbo");
    expect(ipaOf("ọmọ", "yo")).toBe("ɔmɔ");
  });

  it("treats each vowel as its own syllable (káàárọ̀ is four syllables)", () => {
    expect(ipaOf("káàárọ̀", "yo")).toBe("kɑɑɑɾɔ");
  });

  it("reads tone marks as pitch: high, low, high, low", () => {
    const ssml = wordToSsml("káàárọ̀", "yo")!;
    expect(ssml).toContain("<prosody contour=");
    const values = [...ssml.matchAll(/,([+-]\d+)st\)/g)].map((m) => Number(m[1]));
    // two plateau points per syllable
    expect(values).toEqual([3, 3, -3, -3, 3, 3, -3, -3]);
  });

  it("nasalises a vowel followed by n instead of saying a separate n", () => {
    expect(ipaOf("ìbàn", "yo")).toBe("ibɑn");
  });

  it("leaves natural intonation when a word has no tone marks", () => {
    expect(wordToSsml("ekaaro", "yo")).not.toContain("prosody");
  });
});

describe("Hausa", () => {
  it("converts the written word to sounds", () => {
    expect(ipaOf("Barka", "ha")).toBe("bɑɾkɑ");
    expect(ipaOf("safiya", "ha")).toBe("sɑfijɑ");
    expect(ipaOf("shi", "ha")).toBe("ʃi");
    expect(ipaOf("kyau", "ha")).toBe("kjɑu");
    expect(ipaOf("ɗaki", "ha")).toBe("ɗɑki");
    expect(ipaOf("ƙasa", "ha")).toBe("kɑsɑ");
    expect(ipaOf("cin", "ha")).toBe("tʃin");
  });

  it("makes a doubled vowel letter long", () => {
    expect(ipaOf("kaa", "ha")).toBe("kɑː");
  });

  it("adds no pitch: Hausa is written without tone marks", () => {
    expect(wordToSsml("Barka", "ha")).not.toContain("prosody");
  });
});

describe("Igbo", () => {
  it("handles the dotted vowels and digraphs", () => {
    expect(ipaOf("Ụtụtụ", "ig")).toBe("ʊtʊtʊ");
    expect(ipaOf("ọma", "ig")).toBe("ɔmɑ");
    expect(ipaOf("anyị", "ig")).toBe("ɑɲɪ");
    expect(ipaOf("chi", "ig")).toBe("tʃi");
    expect(ipaOf("agha", "ig")).toBe("ɑɣɑ");
  });

  it("gives a nasal before a consonant its own syllable (nnọọ)", () => {
    expect(ipaOf("nnọọ", "ig")).toBe("nnɔɔ");
    const syl = syllabify([
      { k: "N", ipa: "n" }, { k: "C", ipa: "n" }, { k: "V", ipa: "ɔ" }, { k: "V", ipa: "ɔ" },
    ]);
    expect(syl.map((s) => s.ipa)).toEqual(["n", "nɔ", "ɔ"]);
  });

  it("applies tone marks when present", () => {
    expect(wordToSsml("ọ̀ma", "ig")).toContain("contour=");
  });
});

describe("tone contour", () => {
  it("is null without any high or low tone", () => {
    expect(toneContour([{ ipa: "ba", weight: 1 }, { ipa: "ba", weight: 1, tone: "M" }])).toBeNull();
  });

  it("has strictly increasing positions inside 0 to 100", () => {
    const syls = Array.from({ length: 14 }, (_, i) => ({ ipa: "ba", weight: 1, tone: (i % 2 ? "H" : "L") as "H" | "L" }));
    const positions = [...toneContour(syls)!.matchAll(/\((\d+)%/g)].map((m) => Number(m[1]));
    for (let i = 1; i < positions.length; i++) expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
    expect(positions[0]!).toBeGreaterThanOrEqual(0);
    expect(positions.at(-1)!).toBeLessThanOrEqual(100);
  });
});

describe("whole sentences", () => {
  it("keeps punctuation so pauses stay natural, and the markup well-formed", () => {
    const ssml = sentenceToSsml("Ẹ káàárọ̀, kílàsì. Jọ̀wọ́ ṣí àwọn ìwé rẹ.", "yo");
    expect(ssml).toContain(", ");
    expect(ssml).toContain(". ");
    expect(wellFormed(ssml)).toBe(true);
  });

  it("is well-formed for Hausa and Igbo too", () => {
    expect(wellFormed(sentenceToSsml("Barka da safiya, aji. Don Allah ka buɗe littattafan ka.", "ha"))).toBe(true);
    expect(wellFormed(sentenceToSsml("Ụtụtụ ọma, klaasị. Biko meghee akwụkwọ gị.", "ig"))).toBe(true);
  });

  it("leaves English names and words with foreign letters for the voice", () => {
    const ssml = sentenceToSsml("Barka WhatsApp Voice", "ha");
    expect(ssml).toContain("Voice"); // v and c-after-o fine, but 'Voice' has 'v' (not Hausa): left as plain text
    expect(ssml).not.toContain(">Voice</phoneme>");
  });

  it("escapes characters that would break the markup", () => {
    const ssml = sentenceToSsml('A < B & "C"', "ha");
    expect(ssml).not.toMatch(/<(?!\/?(phoneme|prosody))/);
    expect(wellFormed(ssml)).toBe(true);
  });

  it("only uses sounds the Nigerian voice was measured to render", () => {
    const allowed = new Set([..."bdfɡhjklmnpstwzɓɗɲɣŋɾɑeiouɛɔɪʊʃː"]);
    const text = "Ẹ káàárọ̀ pẹ́ gbogbo ṣe ọmọ ìbàn Barka kyau ɗaki ƙasa cin shi Ụtụtụ ọma anyị chi agha nnọọ ngwa";
    for (const lang of ["yo", "ha", "ig"] as const) {
      for (const m of sentenceToSsml(text, lang).matchAll(/ph="([^"]*)"/g)) {
        for (const ch of m[1]!) expect(allowed.has(ch) || "tʃdʒ".includes(ch)).toBe(true);
      }
    }
  });
});
