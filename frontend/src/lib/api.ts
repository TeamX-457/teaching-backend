// Typed client for the Voice Verse API. All paths are same-origin (`/api/*`):
// the dev server proxies them, and in production the host rewrites them.

export class ApiError extends Error {
  status: number;
  code?: string | undefined;
  constructor(message: string, status: number, code?: string | undefined) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      credentials: "include",
      ...(opts.body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts.body) } : {}),
    });
  } catch {
    throw new ApiError("You appear to be offline.", 0, "NETWORK");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; code?: string };
    throw new ApiError(d.message || d.error || `Request failed (${res.status})`, res.status, d.code);
  }
  return data as T;
}

export type LangCfg = {
  code: string;
  name: string;
  speechRecognition: { supported: boolean; locale?: string };
  translation: boolean;
  textToSpeech: { supported: boolean; locale?: string };
};
export type AuthUser = { id: string; name: string; email: string; role: "educator" | "student" };
export type VenueType = "classroom" | "conference" | "church" | "town_hall" | "other";
export type LiveSession = {
  id: string;
  code: string;
  title: string;
  venueType: VenueType;
  sourceLang: string;
  status: "live" | "ended";
  hostName?: string | null;
  listenerCount?: number;
  createdAt: string;
};
export type LiveCaption = {
  id: string;
  seq: number;
  text: string;
  translatedText: string | null;
  translated: boolean;
  createdAt: string;
};
export type TranslateResult = {
  text: string;
  translated: boolean;
  engine: string;
  reason: "no_provider" | "provider_failed" | null;
};

export const api = {
  languages: () => request<{ languages: LangCfg[]; translationProviderConfigured: boolean }>("/api/languages"),
  translate: (b: { text: string; source: string; target: string }) =>
    request<TranslateResult>("/api/translate", { method: "POST", body: b }),

  auth: {
    session: () => request<{ session: unknown; user: AuthUser } | null>("/api/auth/get-session"),
    signIn: (b: { email: string; password: string }) =>
      request<{ user: AuthUser }>("/api/auth/sign-in/email", { method: "POST", body: b }),
    signUp: (b: { name: string; email: string; password: string; role: "educator" | "student" }) =>
      request<{ user: AuthUser }>("/api/auth/sign-up/email", { method: "POST", body: b }),
    signOut: () => request<unknown>("/api/auth/sign-out", { method: "POST", body: {} }),
  },

  live: {
    create: (b: { title: string; venueType: VenueType; sourceLang: string }) =>
      request<{ session: LiveSession }>("/api/live/sessions", { method: "POST", body: b }),
    mine: () => request<{ sessions: LiveSession[] }>("/api/live/sessions/mine"),
    get: (code: string) => request<{ session: LiveSession }>(`/api/live/sessions/${encodeURIComponent(code)}`),
    join: (code: string) => request<{ ok: boolean }>(`/api/live/sessions/${encodeURIComponent(code)}/join`, { method: "POST", body: {} }),
    end: (code: string) => request<{ session: LiveSession }>(`/api/live/sessions/${encodeURIComponent(code)}/end`, { method: "POST", body: {} }),
    addCaption: (code: string, text: string) =>
      request<{ caption: { seq: number } }>(`/api/live/sessions/${encodeURIComponent(code)}/captions`, { method: "POST", body: { text } }),
    captions: (code: string, after: number, lang?: string) =>
      request<{ status: "live" | "ended"; captions: LiveCaption[] }>(
        `/api/live/sessions/${encodeURIComponent(code)}/captions?after=${after}${lang ? `&lang=${encodeURIComponent(lang)}` : ""}`,
      ),
    feedback: (b: { code?: string | undefined; rating: number; comment?: string | undefined }) =>
      request<unknown>("/api/live/feedback", { method: "POST", body: b }),
  },
};

export const VENUES: { value: VenueType; label: string }[] = [
  { value: "classroom", label: "Classroom" },
  { value: "conference", label: "Conference / seminar" },
  { value: "church", label: "Church / worship" },
  { value: "town_hall", label: "Town hall" },
  { value: "other", label: "Other" },
];
export const venueLabel = (v: string) => VENUES.find((x) => x.value === v)?.label ?? v;
