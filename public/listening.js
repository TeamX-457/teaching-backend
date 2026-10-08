// Listening session: audio in -> speech recognition -> translation -> display / speech out.
// Each concern is its own small object so a provider can be swapped without touching the UI.

const params = new URLSearchParams(location.search);
const IN = params.get("in") || "en";
const OUT = params.get("out") || "en";
const CTX = params.get("ctx") || "other";

const STATES = {
  ready: "Ready", listening: "Listening", processing: "Processing", translating: "Translating",
  speaking: "Speaking", paused: "Paused", completed: "Completed", error: "Something went wrong",
};

// User-facing messages. Technical detail never reaches the screen.
const MESSAGES = {
  "not-allowed": "Microphone access was blocked. Allow the microphone in your browser settings, then press Start.",
  "service-not-allowed": "Microphone access was blocked. Allow the microphone in your browser settings, then press Start.",
  "audio-capture": "No microphone was found. Connect or enable one, then try again.",
  "language-not-supported": "This language cannot be recognised on this device.",
  network: "You appear to be offline. Check your connection and try again.",
  unsupported: "Live listening needs Chrome or Edge on this device.",
  "no-speech": "No speech detected. Move closer to the speaker.",
  "poor-audio": "The audio is unclear. Move closer to the speaker.",
  translation: "Translation is not available right now. Showing the original words.",
  "translation-missing": "Translation service is not connected yet. Showing the original words.",
  "rate-limited": "Too many requests. Translation will resume in a moment.",
  tts: "Spoken output failed on this device. You can still read the text.",
};

let cfg, inLang, outLang;
const view = {
  state(s) { $("state").textContent = STATES[s]; $("state").dataset.state = s; },
  message(key, isError = true) { setStatus($("message"), key ? (MESSAGES[key] || key) : "", isError && !!key); },
};

// ---- Session model ------------------------------------------------------
const session = {
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  status: "created", // created -> listening -> processing -> completed
  startedAt: null, endedAt: null, listenedMs: 0, _resumedAt: null,
  segments: [], // { id, at, original, translation, status: "pending"|"translated"|"original-only"|"failed" }
};
function persist() {
  const dur = session.listenedMs + (session._resumedAt ? Date.now() - session._resumedAt : 0);
  history.save({
    id: session.id, title: `${CONTEXTS[CTX] || "Session"} ${new Date(session.startedAt || Date.now()).toLocaleString()}`,
    context: CTX, in: IN, out: OUT, status: session.status,
    startedAt: session.startedAt, endedAt: session.endedAt, durationSec: Math.round(dur / 1000),
    segments: session.segments,
  });
}

// ---- Translation client -------------------------------------------------
const translator = {
  async run(text) {
    if (IN === OUT) return { text, status: "original-only", note: null };
    try {
      const r = await api("/api/translate", { method: "POST", body: { text, source: IN, target: OUT } });
      if (r.translated) return { text: r.text, status: "translated" };
      return { text, status: "original-only", note: r.reason === "no_provider" ? "translation-missing" : "translation" };
    } catch (e) {
      return { text, status: "failed", note: e.status === 429 ? "rate-limited" : (navigator.onLine ? "translation" : "network") };
    }
  },
};

// ---- Speech output ------------------------------------------------------
const speaker = {
  queue: [], busy: false, paused: false,
  supported() { return "speechSynthesis" in window && outLang.textToSpeech.supported; },
  enqueue(text) {
    if (!$("audioOn").checked || !this.supported()) return;
    this.queue.push(text);
    // Keep continuous speech natural: never build a backlog, keep only the newest.
    if (this.queue.length > 2) this.queue.splice(0, this.queue.length - 2);
    this.next();
  },
  next() {
    if (this.busy || this.paused || !this.queue.length) return;
    const u = new SpeechSynthesisUtterance(this.queue.shift());
    u.lang = outLang.textToSpeech.locale || OUT;
    this.busy = true;
    u.onend = () => { this.busy = false; if (!this.queue.length && listener.running) view.state("listening"); this.next(); };
    u.onerror = () => { this.busy = false; view.message("tts"); };
    view.state("speaking");
    speechSynthesis.speak(u);
  },
  pause() { this.paused = true; speechSynthesis.pause(); },
  play() { this.paused = false; speechSynthesis.resume(); this.next(); },
  stop() { this.queue = []; this.busy = false; this.paused = false; speechSynthesis.cancel(); },
};

// ---- Speech recognition -------------------------------------------------
const listener = {
  rec: null, running: false,
  Engine: window.SpeechRecognition || window.webkitSpeechRecognition,
  start() {
    this.rec = new this.Engine();
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.lang = inLang.speechRecognition.locale || IN;
    this.rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i], text = r[0].transcript.trim();
        if (!text) continue;
        view.message("");
        if (r.isFinal) onFinal(text); else $("original").textContent = text; // partial: keeps updating as recognition improves
      }
    };
    this.rec.onerror = (ev) => {
      if (["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(ev.error)) {
        this.running = false; controls.idle(); view.state("error"); view.message(ev.error);
      } else if (ev.error === "network") { view.message("network"); }
      else if (ev.error === "no-speech") { view.message("no-speech", false); }
    };
    // Browsers end recognition after silence; restart while the session is on.
    this.rec.onend = () => { if (this.running) try { this.rec.start(); } catch {} };
    this.rec.start();
    this.running = true;
  },
  stop() { this.running = false; try { this.rec && this.rec.stop(); } catch {} },
};

// ---- UI wiring ----------------------------------------------------------
async function onFinal(text) {
  const seg = { id: session.segments.length + 1, at: Date.now(), original: text, translation: null, status: "pending" };
  session.segments.push(seg);
  $("original").textContent = text;
  renderLog();
  if (IN !== OUT) { view.state("translating"); $("translation").textContent = "…"; }
  const r = await translator.run(text);
  seg.translation = r.status === "translated" ? r.text : null;
  seg.status = r.status;
  if (IN !== OUT) $("translation").textContent = r.status === "translated" ? r.text : "(original words shown: no translation yet)";
  if (r.note) view.message(r.note, r.status === "failed");
  if (r.status === "translated") speaker.enqueue(r.text);
  if (listener.running && !speaker.busy) view.state("listening");
  renderLog();
  persist();
}

function renderLog() {
  if (!session.segments.length) return;
  $("log").innerHTML = session.segments.map((s) =>
    `<div class="seg"><time>${new Date(s.at).toLocaleTimeString()}</time><p>${escapeHtml(s.original)}</p>` +
    (s.translation ? `<p class="out">${escapeHtml(s.translation)}</p>` : "") + `</div>`).join("");
  $("log").scrollTop = $("log").scrollHeight;
}

const controls = {
  running() { $("startBtn").disabled = true; $("pauseBtn").disabled = false; $("stopBtn").disabled = false; $("pauseBtn").textContent = "Pause"; },
  idle() { $("startBtn").disabled = false; $("pauseBtn").disabled = true; $("stopBtn").disabled = session.status === "created"; },
};

$("startBtn").addEventListener("click", () => {
  if (!listener.Engine) { view.state("error"); return view.message("unsupported"); }
  if (!navigator.onLine) { view.state("error"); return view.message("network"); }
  view.message("");
  if (!session.startedAt) { session.startedAt = Date.now(); }
  session.status = "listening"; session._resumedAt = Date.now();
  listener.start(); controls.running(); view.state("listening"); persist();
});
$("pauseBtn").addEventListener("click", () => {
  if (listener.running) {
    listener.stop(); speaker.stop();
    session.listenedMs += Date.now() - session._resumedAt; session._resumedAt = null;
    view.state("paused"); $("pauseBtn").textContent = "Resume"; $("startBtn").disabled = true;
  } else {
    session._resumedAt = Date.now(); listener.start(); view.state("listening"); $("pauseBtn").textContent = "Pause";
  }
});
$("stopBtn").addEventListener("click", () => {
  listener.stop(); speaker.stop();
  view.state("processing");
  if (session._resumedAt) { session.listenedMs += Date.now() - session._resumedAt; session._resumedAt = null; }
  session.endedAt = Date.now(); session.status = "completed";
  const saved = history.save && (persist(), true);
  view.state("completed"); controls.idle(); $("startBtn").disabled = true; $("pauseBtn").disabled = true; $("stopBtn").disabled = true;
  setStatus($("message"), saved ? "Session saved on this device. " : "Could not save the session on this device.");
  const a = document.createElement("a"); a.href = "/history?open=" + session.id; a.textContent = "View it in Past sessions";
  $("message").appendChild(a);
});

$("size").addEventListener("change", () => document.documentElement.style.setProperty("--live-size", $("size").value));
$("ttsPause").addEventListener("click", () => speaker.pause());
$("ttsPlay").addEventListener("click", () => speaker.play());
$("ttsStop").addEventListener("click", () => speaker.stop());
window.addEventListener("offline", () => { if (listener.running) view.message("network"); });
window.addEventListener("online", () => view.message(""));
window.addEventListener("pagehide", () => { if (session.startedAt && session.status !== "completed") persist(); });

(async () => {
  cfg = await loadLanguages();
  inLang = langByCode(cfg, IN); outLang = langByCode(cfg, OUT);
  if (!inLang || !outLang) { view.state("error"); view.message("This language is not supported."); $("startBtn").disabled = true; return; }
  $("meta").textContent = `${CONTEXTS[CTX] || "Session"} · ${inLang.name} → ${outLang.name}`;
  $("outName").textContent = outLang.name;
  $("translationBox").classList.toggle("hidden", IN === OUT);
  const ttsOk = speaker.supported();
  $("audioOn").disabled = !ttsOk;
  ["ttsPlay", "ttsPause", "ttsStop"].forEach((id) => ($(id).disabled = !ttsOk));
  $("audioNote").textContent = ttsOk ? "Use earphones in a shared room." : `Spoken ${outLang.name} is not available on this device yet. Read the text instead.`;
  if (!inLang.speechRecognition.supported) { view.state("error"); view.message(`Listening in ${inLang.name} is not available yet.`); $("startBtn").disabled = true; return; }
  if (!listener.Engine) { view.message("unsupported"); }
  view.state("ready");
})();
