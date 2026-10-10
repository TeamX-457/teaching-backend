import type { ReactNode } from "react";
import { Logo, Waveform } from "./primitives";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div key={title} className="rise">
            <h1 className="text-[28px] font-semibold">{title}</h1>
            {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-ink-foreground lg:flex lg:flex-col lg:justify-end">
        <div className="absolute inset-0 opacity-[0.07] grain-lines" />
        <div className="relative max-w-md fade-in d-2">
          <Waveform bars={7} className="mb-8 h-8 opacity-70" />
          <p className="font-display text-3xl leading-snug">“For the first time, my mother followed the whole service — in Yoruba, in real time.”</p>
          <p className="mt-6 text-sm opacity-60">Media coordinator, Lagos congregation</p>
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
