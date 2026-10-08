// Shared helpers for the Voice Verse pages.
const LANGS = [
  { code: "en", label: "English" },
  { code: "ibb", label: "Ibibio" },
];

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error(
      (data && (data.error || data.message)) || `Request failed (${res.status})`,
    );
    err.status = res.status;
    throw err;
  }
  return data;
}

function $(id) {
  return document.getElementById(id);
}

function fillLangSelect(select, selected) {
  select.innerHTML = LANGS.map(
    (l) => `<option value="${l.code}"${l.code === selected ? " selected" : ""}>${l.label}</option>`,
  ).join("");
}

function setStatus(el, msg, isError = false) {
  el.textContent = msg || "";
  el.classList.toggle("error", !!isError);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Languages (served by the API so config lives in one place) ----------
let _languages = null;
async function loadLanguages() {
  if (_languages) return _languages;
  try {
    _languages = await api("/api/languages");
  } catch {
    // Offline fallback so the UI still renders; the server stays authoritative.
    _languages = {
      languages: [
        { code: "en", name: "English", speechRecognition: { supported: true, locale: "en-NG" }, translation: true, textToSpeech: { supported: true, locale: "en-NG" } },
        { code: "ibb", name: "Ibibio", speechRecognition: { supported: false }, translation: true, textToSpeech: { supported: false } },
      ],
      translationProviderConfigured: false,
    };
  }
  return _languages;
}
const langByCode = (cfg, code) => cfg.languages.find((l) => l.code === code);

function fillLangOptions(select, cfg, selected, filter) {
  select.innerHTML = cfg.languages
    .filter(filter || (() => true))
    .map((l) => `<option value="${l.code}"${l.code === selected ? " selected" : ""}>${escapeHtml(l.name)}</option>`)
    .join("");
}

const CONTEXTS = {
  classroom: "Classroom",
  conference: "Conference / seminar",
  church: "Church / worship",
  town_hall: "Town hall",
  other: "Other",
};

// ---- Session history: kept on this device only (privacy: no accounts, no audio) ----
const HISTORY_KEY = "voiceverse.history.v1";
const history = {
  all() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  },
  save(session) {
    try {
      const list = history.all().filter((s) => s.id !== session.id);
      list.unshift(session);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 100)));
      return true;
    } catch { return false; }
  },
  get(id) { return history.all().find((s) => s.id === id); },
  remove(id) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.all().filter((s) => s.id !== id))); } catch {}
  },
  clear() { try { localStorage.removeItem(HISTORY_KEY); } catch {} },
};

function formatDuration(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m} min ${s}s` : `${s}s`;
}
