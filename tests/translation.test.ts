import { describe, it, expect } from "bun:test";
import { translateWithGlossary } from "@/services/translation.service";
import { generateJoinCode, normalizeJoinCode } from "@/utils/join-code";

describe("translateWithGlossary", () => {
  const glossary = [
    { sourceText: "good", targetText: "X1" },
    { sourceText: "good morning", targetText: "X2" },
  ];

  it("prefers the longest matching phrase", () => {
    const r = translateWithGlossary("Good morning class", glossary);
    expect(r.text).toBe("X2 class");
    expect(r.translated).toBe(true);
    expect(r.engine).toBe("glossary");
  });

  it("matches whole words only", () => {
    const r = translateWithGlossary("goodness", glossary);
    expect(r.translated).toBe(false);
    expect(r.text).toBe("goodness");
  });

  it("reports untranslated text when nothing matches", () => {
    const r = translateWithGlossary("open your books", glossary);
    expect(r).toEqual({ text: "open your books", translated: false, engine: "none" });
  });

  it("treats regex characters in terms literally", () => {
    const r = translateWithGlossary("what is 2+2?", [
      { sourceText: "2+2", targetText: "four" },
    ]);
    expect(r.text).toBe("what is four?");
  });
});

describe("join codes", () => {
  it("generates readable 6-character codes", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it("normalizes user input", () => {
    expect(normalizeJoinCode("  k7m2qx ")).toBe("K7M2QX");
  });
});
