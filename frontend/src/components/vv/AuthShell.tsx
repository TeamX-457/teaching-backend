import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "./primitives";
import { CaptionLoop } from "./scenes";
import { Words } from "./story";
import audience from "@/assets/audience.jpg";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Logo />
          <Link to="/" className="fade-in inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div key={title}>
            <h1 className="font-display text-[34px] leading-tight"><Words text={title} /></h1>
            {subtitle && <p className="rise d-3 mt-2 text-muted-foreground">{subtitle}</p>}
            <div className="rise d-4 mt-8">{children}</div>
            {footer && <div className="rise d-5 mt-8 text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-ink text-ink-foreground lg:flex lg:flex-col lg:justify-end">
        <div className="photo-duo absolute inset-0 opacity-60"><img src={audience} alt="" /></div>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
        <div className="relative max-w-md p-12 fade-in d-2">
          <CaptionLoop />
          <p className="mt-10 font-display text-3xl leading-snug">Every voice in the room, understood.</p>
          <p className="mt-3 text-sm opacity-60">Live subtitles and translation, on the phone in your hand.</p>
        </div>
      </aside>
    </div>
  );
}

export function FieldError({ msg }: { msg?: string | undefined }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-200 ${msg ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
      <p className="overflow-hidden pt-1.5 text-xs text-destructive" role={msg ? "alert" : undefined}>{msg}</p>
    </div>
  );
}
