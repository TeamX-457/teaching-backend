# Design, Motion and Flow Guide (v2: a reference, not a law)

Read this first.

**This guide is a reference, not a recipe and not a law.** It was first written for one product, then generalised. If you build a new site by copying its landing-page structure, you have failed the brief, even if every rule below is followed. Two products that share a section order, the same hero shape and the same card grid look like templates, however polished.

Use **Part A** to decide what is *unique* about the product you are designing and to invent its own signature. Use **Part B** only as a toolkit: easing curves, durations, accessibility rules and traps, to execute your own idea with craft.

---

# Part A. Originality first

## A1. The rule for every AI agent that uses this file

1. **Do not copy a layout from this file or from any earlier site that used it.** Not the section order, not the hero, not the card grid, not the sticky story stage, not the marquee. Those were answers to a different product's question.
2. **Start from the product's own verb.** Ask: *what does this product do, in one verb, and what does the user feel when it works?* The most memorable landing pages let the visitor *do or feel that verb in the first screen*, instead of reading about it.
3. **The medium is the message.** If the product produces subtitles, the page can be told in subtitles. If it produces receipts, the page can be a receipt. If it moves money, the page can be a ledger that balances as you scroll. Pick a medium native to the product.
4. **Invent, then check against Part B.** Concept first, tokens and curves second.
5. **Write down the signature idea in two sentences before coding** (see A4). If you cannot, you have a template, not a concept.
6. **Never present an invented statistic, testimonial, user count or photo as real.**

## A2. Pattern families (pick one primary, at most one secondary)

These are *families of ideas*, not layouts. Each describes the idea, when it fits, and what to avoid copying.

| Family | The idea | Fits when | Avoid |
|---|---|---|---|
| **Demonstration-native** | The first screen *is* the product, running for real, privately, with no sign-up. | The product has an instant, safe action (speak, calculate, convert, preview). | A fake or looped screenshot passed off as live. |
| **Perception shift** | The visitor *experiences the problem, then the relief*: blur to clarity, noise to signal, tangled to sorted, via a control they operate. | The pain is felt, not just known (not understanding, not being heard, confusion). | Gimmick without a real before/after meaning. |
| **Medium-native narrative** | The story is told in the product's own medium: subtitles, a receipt, a timetable, a map, a chat, a ledger. | The output of the product has a recognisable visual form. | Decorative use of the medium that carries no story. |
| **Context morph** | One scene re-arranges itself to fit the visitor's context (venue, role, budget), with real motion between states. | The product serves several distinct situations with one engine. | Tabs that only swap copy. The scene itself must change. |
| **Document-first** | The page is a living document (a certificate, a statement) that fills in as the visitor interacts. | Trust, records and proof are the value. | Skeuomorphic clutter. |
| **Data-ledger** | Real numbers do the persuading, computed live from the visitor's input. | The value is quantitative and personal. | Invented totals. Only show what the visitor typed or what is true. |
| **Field-notes / editorial** | Slow, typographic, human; one idea per screen; almost no chrome. | Mission-led or community products where voice matters most. | Long text with no interaction anywhere. |
| **Guided tour** | A short, interruptible, spatial walk-through the visitor steers (not a video). | Complex product with a clear first-time path. | Hijacking scroll. Always allow skipping. |

You may blend two. Do not blend more than two.

## A3. Originality checklist (answer before you ship)

- If the logo and copy were removed, could someone tell *which product* this is from the layout and motion alone?
- Is there at least one moment on the first screen that the visitor can *operate* (not only watch)?
- Does every animation explain something specific about this product?
- Did you reuse a section from a previous project? If yes, replace it with something that only this product could have.
- Is each claim demonstrated, or merely stated?
- Does it work with reduced motion, no script, a 320 px phone and a keyboard (Part B)?
- Are all numbers, quotes and images real or clearly labelled as samples?

## A4. Concept brief template

Fill this in before coding and keep it at the top of the project's README.

```
Product verb:           (one verb)
What it feels like when it works:   (one sentence)
Signature idea (family):  (name it, then describe it in two sentences)
First-screen interaction:  (what the visitor can do in under five seconds)
Medium it speaks in:       (subtitles / receipt / map / ledger ...)
What we will NOT copy:     (list the patterns we deliberately avoid)
Honesty limits:            (what is not built yet and how the UI says so)
```

## A5. Worked example: Voice Verse (a live-captioning product)

*This is an example of the process, not a layout to reuse.*

```
Product verb:           to be understood.
What it feels like when it works:   the room stops being a blur and becomes clear.
Signature idea:         Demonstration-native + Perception shift + Context morph.
                        The page listens to the visitor and captions them live, in
                        the product's own subtitle language. A slider turns
                        unintelligible speech into understood speech. Seating plans
                        rearrange between a classroom, a church, a conference and a
                        town hall, lighting up as each person follows.
First-screen interaction:  press "Speak to this page", say a sentence, see it as
                           captions and (when a translation service is connected)
                           in another language, or the honest line "Can't translate
                           this yet".
Medium it speaks in:       subtitles (the story is told in film frames with subtitles).
What we will NOT copy:     the sticky chapter stage, marquee, spotlight cards,
                           fabricated testimonials, count-up statistics.
Honesty limits:            Ibibio speech recognition and speech output are not
                           available; translation needs a connected service; the UI
                           says so plainly instead of faking results.
```

What this example teaches: the unique parts were *derived from the product verb*; the craft parts (spring curves, reduced-motion fallbacks, 44 px targets) came from Part B.

## A6. Variation rules for the motion language

Part B gives curves and durations so a product feels consistent *within itself*. Across products, vary these on purpose:

- **Character**: a calm, mature product uses long soft springs; a playful one uses shorter, bouncier ones; a serious financial one uses almost no overshoot. Choose a character and name it.
- **Rhythm**: set a base tempo (for example 70 ms stagger, or 120 ms) and keep it. Do not borrow another product's tempo.
- **One signature motion** per product, built for it, that you would not find on another site.
- **Palette stays in tokens**, but the *temperature, density and corner radius* should differ per product.

---

# Part B. The toolkit (how to execute well)

Everything below describes *how to build things well*, not *what to build*. Where an example is given, it comes from earlier products and is illustrative only.

## B1. The feeling to protect

Decide the product's feeling in one sentence before touching code, then test every decision against it. A good default for anything people rely on: **calm, mature, precise**. Not a demo, not a template.

Principles, in priority order:

1. **Every animation communicates state.** If a motion does not tell the user something, delete it.
2. **Motion is physical, not robotic.** Things overshoot slightly and settle. Never use plain `linear` or default `ease` for meaningful movement. The only linear motion is a continuous drift.
3. **Reveal in reading order.** Content arrives top to bottom, left to right, with small staggers.
4. **Quiet by default, expressive at moments of trust.** Hovers and menus: subtle and fast (120 to 300 ms). Save big motion for two or three signature moments.
5. **Information survives without motion.** Reduced-motion and no-script users still get every fact.
6. **No toys.** No emoji, icon fonts, mascots, stock animation presets, generic spinners. One outline icon set at one stroke weight, inline.
7. **Typography carries hierarchy.** One family. Distinct steps for title, section, body, metadata; tabular figures for numbers people compare.

Dark mode is class based, toggled in the navigation, remembered in local storage, and follows the system on first visit.

## B2. Stack pattern

A static-first or server-rendered stack with a utility CSS framework and a little script. Motion is CSS transitions, keyframes and small scripts. Colours are semantic tokens defined once; never hard-code a colour. After changing classes or the source stylesheet, rebuild the CSS and commit the output if the deploy does not build.

## B3. Motion language (reuse curves and durations, invent the *use*)

**Easing**
- *Spring overshoot*: `cubic-bezier(.34, 1.3, .5, 1)` or `cubic-bezier(.3, 1.25, .4, 1)`.
- *Soft spring entrance*: `cubic-bezier(.2, .9, .25, 1.1)`.
- *Calm ease-out*: `ease-out`.
- Continuous drift only: `linear`, infinite.

**Durations**: hover/press/menu/modal 120 to 200 ms; page entry 280 ms with a 6 px rise; scroll reveals 700 to 900 ms; level changes about 1.7 s; count-ups 1.3 to 1.4 s; stagger step 70 ms per item.

**Reveal primitive.** Starts at `opacity: 0`, `translateY(22px)`, `blur(8px)`; an observer adds a class once; delay via a custom property. Headlines may split into words that un-blur in turn. Both need a no-script fallback.

**Performance rule.** Animate `transform` and `opacity` only (blur is fine on small elements). Never animate width, height, top or left. Test on a mid-range phone.

## B4. Reusable signature techniques (ingredients, not a menu to copy)

- **A level that fills**: a vessel with a liquid layer moved by `translateY(%)` and a drifting SVG wave; first render empty then fill on a "ready" event after any loader. Updates swap panels with stable ids so transitions survive.
- **A tick that draws itself**: SVG `pathLength="1"` with `stroke-dashoffset` animated; later children fade in with a delay list as long as the child count.
- **A document resolving**: `clip-path: inset(0 0 100% 0)` to `inset(0)`; lines fade in at `0.25s + N * 70ms`; check any mask visually.
- **A loader that is the logo**, shown only on first visit or reload and only if work takes longer than about 550 ms. Never a generic spinner.
- **Resolve from noise**: characters scramble then settle left to right. Keep the real text for assistive technology.
- **Morphing layouts**: items animate between coordinate sets with the spring curve instead of cross-fading.
- **A control that changes perception**: a slider that sharpens blurred text, with a keyboard-accessible native input underneath.
- **The page captions the visitor**: real in-browser speech recognition with a clear privacy line and an honest "can't do that yet" state.

## B5. Flow

Write the main journey as numbered steps with URLs before building and do not reorder it. A typical shape: entry, sign up or in, dashboard, create, detail page, act, outcome, supporting pages (guide, about, contact, privacy, terms, accessibility) each on its own URL. State the product's invariants (who may act on what; what is locked; costs always explicit; totals computed, not stored) and never break them.

## B6. Interaction architecture

One confirmation dialog for destructive actions. A small state library for UI state, a fragment-swap library for live panels, vanilla script only where timing control is needed. Send the anti-forgery token on swapped requests.

## B7. Mobile is a first-class screen

Test at **320, 375, 414 and 768 px**. Grid and flex children with wide content need `min-w-0`; tables in `overflow-x-auto`; big figures shrink; stickies and side-by-side stages collapse; touch targets at least about 44 px for products used outdoors or by people with limited reading (36 px minimum anywhere). **Verify with a headless browser:** load every page at each width and assert `scrollWidth <= clientWidth`; take screenshots and look at them.

## B8. Content

Headline is a human sentence. Copy is plain and specific to the audience's context. Dark and light bands alternate for rhythm. Every claim has a demonstration. Statistics are true statements about the product. Never invent user counts, testimonials or photos. Legal pages are drafts until a lawyer has reviewed them.

## B9. Accessibility, reduced motion, no script

- `prefers-reduced-motion: reduce` shortens animation to nothing, shows draws in their final state, shows all reveal content and any loop in its final state. Offer the same switch inside the product.
- Skip link, visible focus rings, `aria-live` on status, `role="alertdialog"` on confirmation, labels on icon-only buttons, `aria-current`, `aria-selected`.
- Never carry information by colour alone.
- No script: reveals forced visible, forms work as plain submissions, pages render on the server.
- Check contrast in both themes and in any high-contrast theme.

## B10. Pitfalls already hit

1. Font-size token and colour token with the same name generate the same utility class. Rename the colour.
2. Dev servers without reload cache templates. Restart after edits.
3. New utility classes do nothing until the stylesheet is rebuilt.
4. Swap-transition tricks need matching ids and final-state markup.
5. Background jobs scheduled "after commit" only run inside the test helper that executes commit callbacks.
6. Do not animate the navigation logo on every page.
7. Delay lists must cover every child.
8. Inverted masks hide content silently. Look at screenshots.
9. Never cover the signature animation with the loader. Start it on the ready event.
10. Photo honesty: verify place and licence, and credit. Prefer drawn scenes over unverified photos.
11. Hidden fixed overlays look like overflow in audits. Exclude them when measuring.
12. **Template drift:** reusing a previous project's sections is the most common failure. Re-read Part A.

## B11. Build order

1. Concept brief (A4).
2. Tokens, type scale, base layout, theme toggle, loaders.
3. Core components and the icon helper.
4. Sign-in pages and the dashboard.
5. The product's main object and its live panels (this sets the quality bar).
6. Confirmation and document moments.
7. The landing page, built around the signature idea, then supporting pages.
8. Mobile audit at four widths, dark mode, reduced motion, print.
9. Tests, then screenshots reviewed by eye.

## B12. Definition of done

- Looks right in light and dark mode, 320 to 1280 px, no horizontal scroll.
- Every motion has a reason, uses the shared curves, and degrades under reduced motion.
- No colours or icon styles outside the tokens and the chosen set.
- The landing page passes the originality checklist (A3).
- CSS rebuilt and committed; tests pass; screenshots reviewed by eye.
