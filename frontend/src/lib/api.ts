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
  textToSpeech: { supported: boolean; locale?: string; cloud?: boolean };
};
export type AuthUser = { id: string; name: string; email: string; role: "educator" | "student" };
export type VenueType = "classroom" | "conference" | "church" | "town_hall" | "other";
export type Tier = "captions" | "standard" | "local";
/** What listeners may know about how a session is paid for. Never any money. */
export type SessionBilling = { tier: string; voice: "none" | "standard" | "local"; translation: boolean; stopped: string | null };
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
  billing?: SessionBilling;
};
export type Balance = Record<Tier, { seconds: number; nextExpiry: string | null }> & { nothingBoughtYet: boolean };
export type ListenerAccess = { pass: boolean; passUntil: string | null; trialSecondsLeft: number; signedIn: boolean };
export type SessionUsage = {
  tier: string; voiceLanguages: number; capSeconds: number | null; sessionSeconds: number; pausedSeconds: number;
  secondsLeft: number | null; secondsUntilCap: number | null; backupVoice: boolean; stopped: string | null; balance: Balance;
};
export type HostBilling = { tier: string; secondsLeft: number | null; stopped: string | null; capReached: boolean };
export type PlanInfo = { id: string; event: "sermon" | "service" | "conference" | "classroom"; tier: Tier; name: string; hours: number; amount: number; about: string; includes: { tier: Tier; hours: number }[] };
export type Pricing = {
  currency: "NGN";
  levels: { tier: Tier; name: string; about: string }[];
  hours: { min: number; max: number; dayHours: number; choices: number[]; prices: Record<Tier, Record<string, number>>; bulk: { fromHours: number; discountPercent: number } };
  plans: PlanInfo[];
  listener: { id: string; amount: number; days: number; trialMinutes: number; about: string };
  rules: { validDays: number; refundable: boolean; graceMinutes: number; extraVoiceLanguages: string };
};
export type Estimate = { usesHours: number; haveHours: number; leftAfterHours: number; enough: boolean; buyHours: number; buyPrice: number; buyPlan: string | null };
export type LiveCaption = {
  id: string;
  seq: number;
  text: string;
  translatedText: string | null;
  translated: boolean;
  createdAt: string;
};
export type Invite = { id: string; identifier: string; email: string | null; name: string | null; pending: boolean };
export type InvitedSession = { code: string; title: string; venueType: VenueType; sourceLang: string; hostName: string | null; createdAt: string };
export type ApiKeyInfo = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };
export type TranslateResult = {
  text: string;
  translated: boolean;
  engine: string;
  reason: "no_provider" | "provider_failed" | null;
};

export const api = {
  languages: () => request<{ languages: LangCfg[]; translationProviderConfigured: boolean }>("/api/languages"),
  translate: (b: { text: string; source: string; target: string; session?: string }) =>
    request<TranslateResult>("/api/translate", { method: "POST", body: b }),

  auth: {
    session: () => request<{ session: unknown; user: AuthUser } | null>("/api/auth/get-session"),
    signIn: (b: { email: string; password: string }) =>
      request<{ user: AuthUser }>("/api/auth/sign-in/email", { method: "POST", body: b }),
    signUp: (b: { name: string; email: string; password: string; role: "educator" | "student" }) =>
      request<{ user: AuthUser }>("/api/auth/sign-up/email", { method: "POST", body: b }),
    signOut: () => request<unknown>("/api/auth/sign-out", { method: "POST", body: {} }),
  },

  billing: {
    pricing: () => request<Pricing>("/api/billing/pricing"),
    me: () => request<{ balance: Balance; listener: ListenerAccess }>("/api/billing/me"),
    estimate: (b: { tier: Tier; minutes: number; voiceLanguages: number }) => request<Estimate>("/api/billing/estimate", { method: "POST", body: b }),
    /** Starts a payment and returns the Paystack page to send the person to. */
    checkout: (plan: string) => request<{ reference: string; authorizationUrl: string }>("/api/payments/checkout", { method: "POST", body: { plan } }),
  },

  keys: {
    list: () => request<{ keys: ApiKeyInfo[] }>("/api/keys"),
    create: (name: string) => request<{ key: ApiKeyInfo; secret: string }>("/api/keys", { method: "POST", body: { name } }),
    revoke: (id: string) => request<{ ok: boolean }>(`/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  contact: (b: { name: string; email: string; topic: string; message: string; website?: string | undefined }) =>
    request<{ ok: boolean }>("/api/contact", { method: "POST", body: b }),

  live: {
    create: (b: { title: string; venueType: VenueType; sourceLang: string; tier?: Tier; voiceLanguages?: number; capMinutes?: number }) =>
      request<{ session: LiveSession }>("/api/live/sessions", { method: "POST", body: b }),
    mine: () => request<{ sessions: LiveSession[] }>("/api/live/sessions/mine"),
    get: (code: string) => request<{ session: LiveSession }>(`/api/live/sessions/${encodeURIComponent(code)}`),
    join: (code: string) => request<{ ok: boolean }>(`/api/live/sessions/${encodeURIComponent(code)}/join`, { method: "POST", body: {} }),
    end: (code: string) => request<{ session: LiveSession }>(`/api/live/sessions/${encodeURIComponent(code)}/end`, { method: "POST", body: {} }),
    addCaption: (code: string, text: string) =>
      request<{ caption: { seq: number }; billing?: HostBilling }>(`/api/live/sessions/${encodeURIComponent(code)}/captions`, { method: "POST", body: { text } }),
    usage: (code: string) => request<SessionUsage>(`/api/live/sessions/${encodeURIComponent(code)}/usage`),
    invites: (code: string) => request<{ invites: Invite[] }>(`/api/live/sessions/${encodeURIComponent(code)}/invites`),
    invite: (code: string, identifier: string) =>
      request<{ invite: Invite }>(`/api/live/sessions/${encodeURIComponent(code)}/invites`, { method: "POST", body: { identifier } }),
    removeInvite: (code: string, id: string) =>
      request<{ ok: boolean }>(`/api/live/sessions/${encodeURIComponent(code)}/invites/${encodeURIComponent(id)}`, { method: "DELETE" }),
    invited: () => request<{ sessions: InvitedSession[] }>("/api/live/invited"),
    captions: (code: string, after: number, lang?: string, wait = 0) =>
      request<{ status: "live" | "ended"; captions: LiveCaption[]; billing?: SessionBilling }>(
        `/api/live/sessions/${encodeURIComponent(code)}/captions?after=${after}${lang ? `&lang=${encodeURIComponent(lang)}` : ""}${wait ? `&wait=${wait}` : ""}`,
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
