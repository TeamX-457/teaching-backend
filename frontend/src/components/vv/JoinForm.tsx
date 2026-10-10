import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "./AuthShell";
import { api, ApiError } from "@/lib/api";

export function JoinForm() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    setErr(undefined);
    try {
      await api.live.get(c);
      nav({ to: "/live/$code", params: { code: c } });
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.status === 404 ? "No session has that code. Check it with the speaker." : "We couldn't check that code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={go} className="rise rounded-2xl border bg-card p-6">
      <KeyRound className="h-5 w-5 text-primary" strokeWidth={1.75} />
      <label htmlFor="code" className="mt-4 block text-sm font-medium">Session code</label>
      <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoComplete="off" autoCapitalize="characters" placeholder="K7M2QX" className="mt-2 h-14 text-center font-mono text-2xl uppercase tracking-[0.3em]" aria-invalid={!!err} />
      <FieldError msg={err} />
      <Button type="submit" size="lg" className="mt-5 w-full" disabled={!code.trim() || busy}>{busy ? "Checking…" : "Join session"}</Button>
    </form>
  );
}
