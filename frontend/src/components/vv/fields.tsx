import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { LangCfg } from "@/lib/api";

export function LangSelect({ label, value, onChange, langs, filter, hint }: {
  label: string; value: string; onChange: (v: string) => void; langs: LangCfg[]; filter?: (l: LangCfg) => boolean; hint?: string;
}) {
  const list = filter ? langs.filter(filter) : langs;
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-2 h-11" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {list.map((l) => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }
      catch { toast.error("Couldn't copy. Select the text and copy it manually."); }
    }}>
      {done ? <Check /> : <Copy />} {done ? "Copied" : label}
    </Button>
  );
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function ProblemBanner({ title, body, onDismiss, action }: { title: string; body: string; onDismiss?: (() => void) | undefined; action?: React.ReactNode }) {
  return (
    <div role="alert" className="rise flex flex-wrap items-start justify-between gap-3 rounded-xl border border-signal/40 bg-signal/8 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex gap-2">
        {action}
        {onDismiss && <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>}
      </div>
    </div>
  );
}
