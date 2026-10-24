import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { Words } from "./story";

/** Shared frame for About, Contact, Privacy and the other public pages. */
export function PublicPage({ eyebrow, title, lead, children, wide }: { eyebrow: string; title: string; lead?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className={`mx-auto px-5 pb-24 pt-14 sm:pt-20 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <p className="rise font-mono text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl leading-tight sm:text-5xl"><Words text={title} /></h1>
        {lead && <p className="rise d-3 mt-5 max-w-2xl text-base leading-relaxed sm:text-lg text-muted-foreground">{lead}</p>}
        <div className="mt-12">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="space-y-5 leading-relaxed text-muted-foreground [&_h2]:mb-0 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">{children}</div>;
}

export function DraftNotice() {
  return (
    <p className="rounded-xl border border-signal/40 bg-signal/8 px-4 py-3 text-sm text-muted-foreground">
      This page is a plain-language draft and has not yet been reviewed by a lawyer.
    </p>
  );
}
