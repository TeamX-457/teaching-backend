import { LANGUAGES } from "@/config/languages";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const MAX_TEXTS = 25;
export const MAX_CHARS = 2000;

const langRows = () =>
  LANGUAGES.map((l) => ({ code: l.code, name: l.name, target: l.translation }));

/** OpenAPI 3.1 description of the public API. */
export function openApiSpec(baseUrl: string) {
  const error = {
    description: "Error",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "Voice Verse API",
      version: "1.0.0",
      description:
        "Translate text between English, French, Spanish, Yoruba, Hausa, Igbo and Ibibio. " +
        "Authenticate with an API key created in your Voice Verse account.",
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/v1/translate": {
        post: {
          operationId: "translate",
          summary: "Translate one text, or up to 25 texts in one call",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/TranslateRequest" } } },
          },
          responses: {
            "200": {
              description: "Translation result. Check `translated` on each item.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/TranslateResponse" } } },
            },
            "400": error,
            "401": error,
            "422": error,
            "429": error,
          },
        },
      },
      "/v1/speech": {
        post: {
          operationId: "speech",
          summary: "Spoken audio (MP3) for a sentence",
          description:
            "Hausa, Yoruba and Igbo are spoken by native voices (male and female). If those are unavailable, a Nigerian " +
            "English voice reads them from phonetic rules. English, French and Spanish use natural voices. There is no Ibibio voice.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SpeechRequest" } } },
          },
          responses: {
            "200": { description: "MP3 audio", content: { "audio/mpeg": { schema: { type: "string", format: "binary" } } } },
            "400": error,
            "401": error,
            "422": error,
            "429": error,
            "501": error,
            "502": error,
          },
        },
      },
      "/v1/languages": {
        get: {
          operationId: "listLanguages",
          summary: "List supported languages",
          security: [],
          responses: { "200": { description: "Languages" } },
        },
      },
      "/v1/health": {
        get: { operationId: "health", summary: "Service status", security: [], responses: { "200": { description: "OK" } } },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Key looks like vv_..." } },
      schemas: {
        TranslateRequest: {
          type: "object",
          required: ["source", "target"],
          description: "Send exactly one of `text` or `texts`.",
          properties: {
            source: { type: "string", examples: ["en"], description: "Language code of the input." },
            target: { type: "string", examples: ["ibb"], description: "Language code to translate into." },
            text: { type: "string", maxLength: MAX_CHARS },
            texts: { type: "array", items: { type: "string", maxLength: MAX_CHARS }, minItems: 1, maxItems: MAX_TEXTS },
          },
        },
        SpeechRequest: {
          type: "object",
          required: ["text", "language"],
          properties: {
            text: { type: "string", maxLength: 1000, description: "Written in the language's normal spelling, with tone marks if you have them." },
            language: { type: "string", enum: ["en", "fr", "es", "yo", "ha", "ig"] },
            voice: { type: "string", enum: ["female", "male"], default: "female" },
            rate: { type: "number", minimum: 0.5, maximum: 2, default: 1 },
          },
        },
        TranslationItem: {
          type: "object",
          properties: {
            index: { type: "integer" },
            text: { type: "string", description: "The translation, or the original text when `translated` is false." },
            translated: { type: "boolean" },
            engine: { type: "string", enum: ["spitch", "azure", "usem", "llm", "provider", "glossary", "none"] },
            reason: { type: ["string", "null"], enum: ["no_provider", "provider_failed", null] },
          },
        },
        TranslateResponse: {
          type: "object",
          properties: {
            id: { type: "string" },
            object: { type: "string", const: "translation" },
            source: { type: "string" },
            target: { type: "string" },
            translations: { type: "array", items: { $ref: "#/components/schemas/TranslationItem" } },
            text: { type: "string", description: "Only when the request used `text`." },
            translated: { type: "boolean", description: "Only when the request used `text`." },
            usage: { type: "object", properties: { characters: { type: "integer" }, items: { type: "integer" } } },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { message: { type: "string" }, type: { type: "string" }, code: { type: "string" } },
            },
          },
        },
      },
    },
  };
}

/** Plain-text brief an AI agent can read once and then use the API. */
export function llmsText(baseUrl: string) {
  const targets = langRows().filter((l) => l.target).map((l) => `${l.code} (${l.name})`).join(", ");
  return `# Voice Verse API

Voice Verse translates text between English, French, Spanish, Yoruba, Hausa, Igbo and Ibibio.
Base URL: ${baseUrl}
Docs: ${baseUrl}/v1/docs     OpenAPI: ${baseUrl}/v1/openapi.json

## Authentication
Send your key on every request:  Authorization: Bearer vv_YOUR_KEY
Keys are created by a signed-in user in their Voice Verse account (Developers page). Never print or log the key.

## Translate
POST ${baseUrl}/v1/translate
Content-Type: application/json

{ "source": "en", "target": "ibb", "text": "Good morning, class." }

Batch up to ${MAX_TEXTS} texts (each up to ${MAX_CHARS} characters) in one call, in order:

{ "source": "en", "target": "fr", "texts": ["Hello", "Please sit down"] }

Response:
{
  "id": "tr_...", "object": "translation", "source": "en", "target": "ibb",
  "translations": [ { "index": 0, "text": "...", "translated": true, "engine": "usem", "reason": null } ],
  "text": "...", "translated": true,           // only when you sent "text"
  "usage": { "characters": 20, "items": 1 }
}

## Speak (text to speech)
POST ${baseUrl}/v1/speech   { "text": "Barka da safiya", "language": "ha", "voice": "female", "rate": 1 }
Returns audio/mpeg (an MP3), up to 1000 characters per call. Languages: en, fr, es, yo, ha, ig. No Ibibio voice (HTTP 422, code no_voice).
Hausa, Yoruba and Igbo are spoken by native voices (male and female), so write them in normal spelling.
For Yoruba, keep the tone marks (á à) from the translation; the voice uses them. If the native voices are unavailable the
server falls back to a Nigerian English voice driven by phonetic rules, so you always get audio.

## Rules for using it well
- ALWAYS check "translated". When it is false, "text" is the ORIGINAL text, not a translation; "reason" says why
  ("no_provider": that language pair is not connected yet, "provider_failed": the engine failed, retry later).
- Prefer "texts" over many single calls. Cache results you will reuse.
- Language codes: ${langRows().map((l) => l.code).join(", ")}. Valid targets: ${targets}.
- Yoruba, Hausa and Igbo translations come from a native Nigerian-language engine (English to and from those three, best quality);
  other pairs use a general engine. English, French, Spanish, Yoruba, Hausa and Igbo translate between each other. Ibibio (ibb) is English-to-Ibibio only and depends on a separate service that may be unavailable.
- source and target must differ.
- Limit: 120 requests per minute per key. On HTTP 429 wait Retry-After seconds (60).
- Errors look like { "error": { "message", "type", "code" } }. 401 = bad or missing key, 422 = unsupported pair, 400 = bad request.

## Example (curl)
curl ${baseUrl}/v1/translate \\
  -H "Authorization: Bearer $VOICEVERSE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"en","target":"ibb","text":"Welcome, everyone."}'

## Example (Python)
import os, requests
r = requests.post("${baseUrl}/v1/translate",
    headers={"Authorization": f"Bearer {os.environ['VOICEVERSE_API_KEY']}"},
    json={"source": "en", "target": "ibb", "texts": ["Welcome, everyone."]}, timeout=30)
r.raise_for_status()
for t in r.json()["translations"]:
    print(t["text"] if t["translated"] else "(not translated: " + str(t["reason"]) + ")")
`;
}

/** Human-readable documentation page. */
export function docsHtml(baseUrl: string) {
  const u = esc(baseUrl);
  const rows = langRows()
    .map((l) => `<tr><td><code>${esc(l.code)}</code></td><td>${esc(l.name)}</td><td>${l.target ? "Yes" : "No"}</td></tr>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voice Verse API</title>
<style>
:root{--bg:#f6f3ec;--fg:#0e1b1a;--mut:#5b6665;--card:#fff;--line:#d5cfbf;--acc:#1f8a78;--code:#0e1b1a;--codefg:#e9efec}
@media (prefers-color-scheme:dark){:root{--bg:#0e1b1a;--fg:#f6f3ec;--mut:#a8b5b2;--card:#162826;--line:#2c4a45;--acc:#2fb59c;--code:#0a1413;--codefg:#e9efec}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:820px;margin:0 auto;padding:40px 20px 80px}
h1{font:500 38px/1.15 Georgia,serif;margin:0 0 8px}h2{font:500 24px Georgia,serif;margin:44px 0 10px}
p,li{color:var(--mut)}a{color:var(--acc)}code{font:13px ui-monospace,Menlo,Consolas,monospace}
pre{background:var(--code);color:var(--codefg);padding:16px;border-radius:12px;overflow-x:auto;margin:12px 0}
p code,li code,td code{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--fg)}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
td,th{padding:10px 14px;border-bottom:1px solid var(--line);text-align:left}th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.pill{display:inline-block;background:var(--acc);color:#fff;border-radius:99px;padding:2px 10px;font-size:12px;margin-right:8px}
.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin:14px 0}
</style></head><body><main>
<h1>Voice Verse API</h1>
<p>Translate text between English, French, Spanish, Yoruba, Hausa, Igbo and Ibibio with one HTTP call. Same engine that powers the Voice Verse app.</p>
<p><a href="${u}/v1/openapi.json">OpenAPI spec</a> · <a href="${u}/v1/llms.txt">Plain-text brief for AI agents</a></p>

<h2>1. Get a key</h2>
<p>Sign in to Voice Verse, open <strong>Developers</strong>, and create a key. It looks like <code>vv_…</code> and is shown once. Keep it secret: it can spend your quota.</p>

<h2>2. Translate</h2>
<pre><code>curl ${u}/v1/translate \\
  -H "Authorization: Bearer $VOICEVERSE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"en","target":"ibb","text":"Good morning, class."}'</code></pre>
<pre><code>{
  "id": "tr_8f2c…", "object": "translation", "source": "en", "target": "ibb",
  "translations": [{ "index": 0, "text": "…", "translated": true, "engine": "usem", "reason": null }],
  "text": "…", "translated": true,
  "usage": { "characters": 20, "items": 1 }
}</code></pre>
<p>Send <code>texts</code> (an array, up to ${MAX_TEXTS} items of ${MAX_CHARS} characters) instead of <code>text</code> to translate many at once. Results come back in the same order.</p>
<div class="box"><span class="pill">Important</span>Always check <code>translated</code>. When it is <code>false</code>, <code>text</code> is your original text, and <code>reason</code> is <code>no_provider</code> (that pair is not connected yet) or <code>provider_failed</code> (try again).</div>

<h2>JavaScript</h2>
<pre><code>const res = await fetch("${u}/v1/translate", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.VOICEVERSE_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ source: "en", target: "ibb", texts: ["Welcome", "Please sit down"] }),
});
const { translations } = await res.json();</code></pre>

<h2>Python</h2>
<pre><code>import os, requests
r = requests.post("${u}/v1/translate",
    headers={"Authorization": f"Bearer {os.environ['VOICEVERSE_API_KEY']}"},
    json={"source": "en", "target": "fr", "text": "Welcome, everyone."}, timeout=30)
print(r.json()["text"])</code></pre>

<h2>Speak</h2>
<pre><code>curl ${u}/v1/speech \
  -H "Authorization: Bearer $VOICEVERSE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Barka da safiya","language":"ha"}' --output hello.mp3</code></pre>
<p>Returns an MP3 (up to 1000 characters). Languages: <code>en</code>, <code>fr</code>, <code>es</code>, <code>yo</code>, <code>ha</code>, <code>ig</code>; Ibibio has no voice yet. Hausa, Yoruba and Igbo are spoken by native male and female voices, with an automatic fallback to a Nigerian English voice, so keep tone marks in Yoruba text.</p>

<h2>Languages</h2>
<table><tr><th>Code</th><th>Language</th><th>Can translate into</th></tr>${rows}</table>
<p>List them any time with <code>GET /v1/languages</code> (no key needed). English, French, Spanish, Yoruba, Hausa and Igbo translate between each other. Ibibio is English to Ibibio only, and may be unavailable.</p>

<h2>Errors and limits</h2>
<p>Errors look like <code>{ "error": { "message", "type", "code" } }</code>.</p>
<ul>
<li><code>400</code> invalid request, e.g. both <code>text</code> and <code>texts</code>, or too long.</li>
<li><code>401</code> missing, invalid or revoked key.</li>
<li><code>422</code> unsupported language, or source equals target.</li>
<li><code>429</code> more than 120 requests per minute for a key. Wait the <code>Retry-After</code> seconds.</li>
</ul>

<h2>Use it from Claude or another AI agent</h2>
<p>Give the agent two things: the key (as an environment variable or secret), and this instruction:</p>
<pre><code>You can translate text with the Voice Verse API.
Read ${u}/v1/llms.txt for how to call it.
The API key is in the environment variable VOICEVERSE_API_KEY. Never print it.
Check "translated" in every result before using the text.</code></pre>
</main></body></html>`;
}
