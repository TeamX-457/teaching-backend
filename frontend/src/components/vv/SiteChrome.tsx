import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "./primitives";
import { useStore } from "@/lib/store";

export function SiteHeader() {
  const user = useStore((s) => s.user);
  return (
    <header className="fade-in sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#use" className="transition-colors hover:text-foreground">Who it's for</a>
          <a href="#trust" className="transition-colors hover:text-foreground">Accessibility</a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild><a href="/app">Open dashboard</a></Button>
          ) : (
            <>
              <Button variant="ghost" asChild className="hidden sm:inline-flex"><a href="/login">Sign in</a></Button>
              <Button asChild><a href="/signup">Get started</a></Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">Real-time speech, subtitles and translation for the places where people gather.</p>
        </div>
        {[
          ["Product", [["Start listening", "/app/listen"], ["Languages", "/app/languages"], ["Help centre", "/app/help"]]],
          ["Account", [["Sign in", "/login"], ["Create account", "/signup"], ["Reset password", "/forgot-password"]]],
          ["Company", [["Accessibility", "/"], ["Privacy", "/"], ["Terms", "/"]]],
        ].map(([h, links]) => (
          <div key={h as string}>
            <p className="text-sm font-medium">{h as string}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {(links as string[][]).map(([l, to]) => (
                <li key={l}><a href={to} className="transition-colors hover:text-foreground">{l}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-muted-foreground">© {new Date().getFullYear()} Voice Verse. Built for accessible communication.</p>
      </div>
    </footer>
  );
}
