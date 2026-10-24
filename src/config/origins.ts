/**
 * Which websites may call this API from a browser with the person's login cookie.
 *
 * Before launch the API trusted every origin, which let any website a signed-in person visited act as them.
 * Now only these are trusted. The Android app and server-to-server callers (VisionMirror, scripts) are not
 * browsers and are not affected by CORS; the app sends the API's own address as its Origin, so that is listed too.
 *
 * Add another address (a custom domain, a staging site) with ALLOWED_ORIGINS, comma separated:
 *   ALLOWED_ORIGINS=https://voiceverse.example.com,https://staging.example.com
 */
const BUILT_IN = ["https://voiceverse-app.vercel.app", "https://voiceverse-rose.vercel.app"];
const LOCAL_DEV = ["http://localhost:5173", "http://localhost:8080", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:8080"];

const clean = (o: string) => o.trim().replace(/\/+$/, "").toLowerCase();

export function allowedOrigins(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(clean).filter(Boolean);
  const dev = process.env.NODE_ENV === "production" ? [] : LOCAL_DEV;
  return [...new Set([...BUILT_IN, ...extra, ...dev].map(clean))];
}

export const isAllowedOrigin = (origin: string | null | undefined) =>
  !!origin && allowedOrigins().includes(clean(origin));

/** The public developer API takes a bearer key, never a cookie, so any website may call it. */
export const isPublicApiPath = (url: string) => url === "/v1" || url.startsWith("/v1/") || url.startsWith("/v1?");
