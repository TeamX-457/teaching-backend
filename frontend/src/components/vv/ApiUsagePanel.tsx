import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Download, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, type ApiUsage } from "@/lib/api";
import { cn } from "@/lib/utils";

const PACKS = [5_000, 20_000, 100_000];
const PERIODS = [7, 30, 90];

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const minutes = (seconds: number) => `${Math.round((seconds / 60) * 10) / 10} min`;
const KIND: Record<string, string> = { translation: "Translation", speech: "Speech", transcription: "Transcription" };
const CLASS: Record<string, string> = { text: "", standard: " · standard voice", local: " · local voice" };

/** Developer usage: what was used and what it costs at the billed prices, credit, and a spending limit per key. */
export function ApiUsagePanel() {
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  const [paying, setPaying] = useState<number | null>(null);
  const usage = useQuery({ queryKey: ["api-usage", days], queryFn: () => api.keys.usage(days), refetchInterval: 60_000 });

  async function buy(n: number) {
    setPaying(n);
    try {
      const r = await api.billing.checkout(`api-credit-${n}`);
      window.location.href = r.authorizationUrl; // Paystack's secure page
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "We couldn't start the payment. Please try again.");
      setPaying(null);
    }
  }

  const cap = useMutation({
    mutationFn: (v: { id: string; naira: number | null }) => api.keys.setCap(v.id, v.naira),
    onSuccess: () => { toast.success("Limit saved."); qc.invalidateQueries({ queryKey: ["api-usage"] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the limit."),
  });

  const u = usage.data;
  return (
    <section className="rise d-2 rounded-2xl border bg-card p-6" aria-labelledby="usage-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="usage-title" className="flex items-center gap-2 text-lg font-medium"><BarChart3 className="h-5 w-5 text-primary" /> Usage and credit</h2>
        <div className="flex gap-1" role="radiogroup" aria-label="Period">
          {PERIODS.map((d) => (
            <button key={d} role="radio" aria-checked={days === d} onClick={() => setDays(d)}
              className={cn("rounded-full border px-3 py-1 text-xs transition focus-visible:ring-2 focus-visible:ring-ring", days === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-secondary")}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      {usage.isPending ? (
        <div className="shimmer mt-5 h-40 rounded-xl" aria-label="Loading usage" />
      ) : usage.isError || !u ? (
        <p className="mt-5 text-sm text-destructive">Couldn't load your usage. Check your connection and reload.</p>
      ) : (
        <>
          {u.billing === "preview" && (
            <p className="mt-4 rounded-lg bg-secondary px-4 py-3 text-sm">Charging isn't switched on yet. The amounts below show what your use would cost at the prices on this page. Nothing is taken from your credit.</p>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Stat label="Credit" value={naira(u.creditKobo)} hint={u.billing === "on" ? "Used as you call the API" : "Not used yet"} />
            <Stat label={`Cost, ${u.days} days`} value={naira(u.totals.amountKobo)} hint={`${u.totals.calls.toLocaleString("en-NG")} calls`} />
            <Stat label="Words translated" value={u.totals.words.toLocaleString("en-NG")} />
            <Stat label="Audio" value={minutes(u.totals.audioSeconds)} hint="speech and transcription" />
          </div>

          <div className="mt-6">
            <h3 className="flex items-center gap-2 text-sm font-medium"><Wallet className="h-4 w-4" /> Add credit</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {PACKS.map((n) => (
                <Button key={n} variant="outline" disabled={paying !== null} onClick={() => buy(n)}>
                  {paying === n ? "Opening payment…" : `₦${n.toLocaleString("en-NG")}`}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Paid on Paystack. Credit does not expire.</p>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium">Prices</h3>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Rate label="Translation" value={`${naira(u.rates.translatePer100Words * 100)} per 100 words`} />
              <Rate label="Speech, standard voice" value={`${naira(u.rates.speechStandardPerMinute * 100)} per minute`} />
              <Rate label="Speech, local voice" value={`${naira(u.rates.speechLocalPerMinute * 100)} per minute`} />
              <Rate label="Transcription" value={`${naira(u.rates.transcribePerMinute * 100)} per minute`} />
            </dl>
          </div>

          {u.byKind.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium">What you used</h3>
              <ul className="mt-2 divide-y rounded-xl border text-sm">
                {u.byKind.map((r) => (
                  <li key={r.kind + r.voiceClass} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span>{KIND[r.kind] ?? r.kind}{CLASS[r.voiceClass] ?? ""}</span>
                    <span className="text-muted-foreground">{r.calls.toLocaleString("en-NG")} calls · {r.kind === "translation" ? `${r.units.toLocaleString("en-NG")} words` : minutes(r.units)}</span>
                    <span className="font-medium tabular-nums">{naira(r.amountKobo)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-medium">By key, and a monthly limit</h3>
            <p className="mt-1 text-xs text-muted-foreground">A key stops working for the rest of the month when it reaches its limit, so a runaway program cannot spend more than you allow.</p>
            {u.byKey.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Create a key above to start. Its use will show here.</p>
            ) : (
              <ul className="mt-2 divide-y rounded-xl border">
                {u.byKey.map((k) => <KeyRow key={k.keyId ?? "gone"} k={k} busy={cap.isPending} onSave={(n) => k.keyId && cap.mutate({ id: k.keyId, naira: n })} />)}
              </ul>
            )}
          </div>

          <Daily u={u} />
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-secondary px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 border-b py-1.5"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function KeyRow({ k, onSave, busy }: { k: ApiUsage["byKey"][number]; onSave: (naira: number | null) => void; busy: boolean }) {
  const [value, setValue] = useState(k.capKobo != null ? String(k.capKobo / 100) : "");
  const changed = value.trim() !== (k.capKobo != null ? String(k.capKobo / 100) : "");
  const n = Number(value);
  const valid = value.trim() === "" || (Number.isInteger(n) && n >= 100);
  const used = k.capKobo ? Math.min(100, Math.round((k.monthKobo / k.capKobo) * 100)) : 0;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{k.name}</p>
          <p className="text-xs text-muted-foreground">{k.prefix && <span className="font-mono">{k.prefix}… · </span>}{k.calls.toLocaleString("en-NG")} calls · {naira(k.amountKobo)} in this period · {naira(k.monthKobo)} this month</p>
        </div>
        {k.keyId && (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (valid && changed) onSave(value.trim() === "" ? null : n); }}>
            <label className="sr-only" htmlFor={`cap-${k.keyId}`}>Monthly limit in naira</label>
            <span className="text-sm text-muted-foreground">₦</span>
            <Input id={`cap-${k.keyId}`} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))} placeholder="No limit" className="h-9 w-28" />
            <Button type="submit" size="sm" variant="outline" disabled={!valid || !changed || busy}>Save</Button>
          </form>
        )}
      </div>
      {k.capKobo != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the monthly limit used">
          <div className={cn("h-full rounded-full", used >= 90 ? "bg-destructive" : "bg-primary")} style={{ width: `${used}%` }} />
        </div>
      )}
      {!valid && <p className="mt-1 text-xs text-destructive">A limit must be a whole number of naira, at least 100.</p>}
    </li>
  );
}

function Daily({ u }: { u: ApiUsage }) {
  if (u.daily.length === 0) return null;
  const max = Math.max(...u.daily.map((d) => d.amountKobo), 1);
  const csv = () => {
    const rows = ["date,calls,billed_naira", ...u.daily.map((d) => `${d.day},${d.calls},${(d.amountKobo / 100).toFixed(2)}`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type: "text/csv" }));
    a.download = `voiceverse-api-usage-${u.days}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Day by day</h3>
        <Button size="sm" variant="ghost" onClick={csv}><Download /> Download CSV</Button>
      </div>
      <div className="mt-3 flex h-24 items-end gap-1" role="img" aria-label="Billed amount per day">
        {u.daily.map((d) => (
          <div key={d.day} className="group relative flex-1">
            <div className="w-full rounded-t bg-primary/70 transition group-hover:bg-primary" style={{ height: `${Math.max(4, (d.amountKobo / max) * 96)}px` }} title={`${d.day}: ${naira(d.amountKobo)}, ${d.calls} calls`} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{u.daily[0]!.day} to {u.daily[u.daily.length - 1]!.day}. Hover a bar for the day's amount.</p>
    </div>
  );
}
