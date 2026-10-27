import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Download, LifeBuoy, ShieldCheck, Smartphone } from "lucide-react";
import { PublicPage } from "@/components/vv/PublicPage";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/download")({
  head: () => ({ meta: [{ title: "Get the Android app — Voice Verse" }] }),
  component: DownloadPage,
});

const APK_PATH = "/downloads/voiceverse.apk";

const STEPS: [string, string][] = [
  ["Download the app", "Tap the button on your Android phone. The file is about 16 MB."],
  ["Allow the install", "Open the downloaded file. If Android asks, allow your browser to install apps. You can switch that off again afterwards."],
  ["Open Voice Verse", "Sign in or create an account, enter a session code, and the words appear the moment someone speaks."],
];

const HELP: { q: string; a: string }[] = [
  {
    q: "My browser says the file isn't commonly downloaded or may be harmful",
    a: "That's Chrome's standard message for any app that isn't from the Play Store. Tap Download anyway (or Keep), then open the file. Voice Verse is signed and contains no ads or trackers.",
  },
  {
    q: "Nothing happened when I tapped the button",
    a: "Press and hold the button, choose \"Download link\", or use the Copy link button below and paste it into Chrome's address bar. Make sure you're on Wi-Fi or have mobile data on.",
  },
  {
    q: "It says I can't install from this source",
    a: "Open Settings → Apps → Special access → Install unknown apps, pick your browser (Chrome) and switch on Allow from this source. Then open the downloaded file again.",
  },
  {
    q: "Play Protect warns me about the app",
    a: "Tap More details, then Install anyway. Play Protect shows this for any app it hasn't seen before.",
  },
  {
    q: "I can't find the downloaded file",
    a: "Open the Files or Downloads app on your phone and look in Downloads for VoiceVerse.apk. In Chrome you can also open the three-dot menu → Downloads.",
  },
  {
    q: "I'm on an iPhone or a computer",
    a: "The app is for Android phones. On any other device, Voice Verse works in the browser at the same address, with the same account.",
  },
];

function DownloadPage() {
  const [href, setHref] = useState(APK_PATH);
  const [android, setAndroid] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    setHref(`${window.location.origin}${APK_PATH}`);
    setAndroid(/android/i.test(navigator.userAgent));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy this link", href);
    }
  }

  return (
    <PublicPage
      eyebrow="Android app"
      title="Voice Verse in your pocket."
      lead="The same live subtitles and translation, built natively for Android. Join a session with a code, read along in your language, or host from your phone."
    >
      {android === false && (
        <p role="status" className="mb-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          You're not on an Android phone. Open this page on your phone, or copy the link below and send it to yourself.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border bg-card p-6 sm:p-8" aria-labelledby="dl-title">
          <h2 id="dl-title" className="flex items-center gap-2 text-lg font-medium"><Smartphone className="h-5 w-5 text-primary" /> Install on Android</h2>
          <ol className="mt-5 space-y-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">{i + 1}</span>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="text-sm text-muted-foreground">{d}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <a href={APK_PATH} download="VoiceVerse.apk"><Download className="mr-2 h-4 w-4" /> Download for Android</a>
            </Button>
            <Button size="lg" variant="outline" onClick={copy} aria-live="polite">
              {copied ? <><Check className="mr-2 h-4 w-4" /> Link copied</> : <><Copy className="mr-2 h-4 w-4" /> Copy link</>}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Version 1.2.0 · Android 8.0 or newer · 16 MB</p>
          <p className="mt-4 break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs text-muted-foreground" data-testid="apk-url">{href}</p>
        </section>

        <aside className="rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-lg font-medium"><ShieldCheck className="h-5 w-5 text-primary" /> Good to know</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>Hosting needs microphone access. Listening never does.</li>
            <li>The app connects straight to Voice Verse. Your account and sessions are the same as on the website.</li>
            <li>Prefer not to install anything? Voice Verse also works in Chrome on any phone.</li>
          </ul>
        </aside>
      </div>

      <section className="mt-6 rounded-2xl border bg-card p-6 sm:p-8" aria-labelledby="help-title">
        <h2 id="help-title" className="flex items-center gap-2 text-lg font-medium"><LifeBuoy className="h-5 w-5 text-primary" /> Download didn't work?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Browsers are cautious about apps from outside the Play Store. These are the usual fixes.</p>
        <ul className="mt-4 divide-y">
          {HELP.map((h, i) => (
            <li key={h.q}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm font-medium"
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? null : i)}
              >
                {h.q}
                <span aria-hidden className="text-muted-foreground">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && <p className="pb-4 text-sm text-muted-foreground">{h.a}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Still stuck? <a className="text-primary underline underline-offset-4" href="/contact">Tell us what happened</a> and we'll help.
        </p>
      </section>
    </PublicPage>
  );
}
