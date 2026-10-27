import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Copy, KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiUsagePanel } from "@/components/vv/ApiUsagePanel";
import { PageHeader } from "@/components/vv/primitives";
import { api, ApiError } from "@/lib/api";

export const Route = createFileRoute("/app/developers")({
  head: () => ({ meta: [{ title: "Developers — Voice Verse" }] }),
  component: Developers,
});

// The public API is served by the API project, not by this site.
const API_BASE = "https://voiceverse-rose.vercel.app";

const CLAUDE_BRIEF = `You can translate text with the Voice Verse API.
Read ${API_BASE}/v1/llms.txt for how to call it.
The API key is in the environment variable VOICEVERSE_API_KEY. Never print it.
Check "translated" in every result before using the text.`;

const CURL = `curl ${API_BASE}/v1/translate \\
  -H "Authorization: Bearer $VOICEVERSE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"en","target":"ibb","text":"Good morning, class."}'`;

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it by hand.");
        }
      }}
    >
      {done ? <><Check /> Copied</> : <><Copy /> {label}</>}
    </Button>
  );
}

function Developers() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; secret: string } | null>(null);

  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api.keys.list() });

  const create = useMutation({
    mutationFn: (n: string) => api.keys.create(n),
    onSuccess: (r) => {
      setFresh({ name: r.key.name, secret: r.secret });
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't create the key."),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.keys.revoke(id),
    onSuccess: () => {
      toast.success("Key revoked. It stops working straight away.");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: () => toast.error("Couldn't revoke that key. Try again."),
  });

  const list = keys.data?.keys ?? [];

  return (
    <>
      <PageHeader
        title="Developers"
        description="Translate text from your own code, or let Claude call Voice Verse for you. Same engine as the app."
        actions={<Button variant="outline" asChild><a href={`${API_BASE}/v1/docs`} target="_blank" rel="noreferrer"><BookOpen /> API docs</a></Button>}
      />

      <div className="max-w-3xl space-y-8">
        <section className="rise rounded-2xl border bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-medium"><KeyRound className="h-5 w-5 text-primary" /> API keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">A key lets a program translate on your behalf. Create one per project so you can revoke them separately.</p>

          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (name.trim() && !create.isPending) create.mutate(name.trim()); }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Claude assistant" aria-label="Key name" className="h-11" />
            <Button type="submit" size="lg" disabled={!name.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create key"}</Button>
          </form>

          {fresh && (
            <div className="mt-5 rounded-xl border border-primary/40 bg-primary/5 p-4" role="status">
              <p className="flex items-center gap-2 text-sm font-medium"><ShieldAlert className="h-4 w-4 text-primary" /> Copy your key now. It won't be shown again.</p>
              <p className="mt-1 text-xs text-muted-foreground">{fresh.name}</p>
              <code className="mt-3 block break-all rounded-lg bg-background px-3 py-2.5 font-mono text-sm" data-testid="new-key">{fresh.secret}</code>
              <div className="mt-3 flex gap-2">
                <CopyButton text={fresh.secret} label="Copy key" />
                <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>I've saved it</Button>
              </div>
            </div>
          )}

          <div className="mt-6">
            {keys.isPending ? (
              <div className="shimmer h-16 rounded-xl" aria-label="Loading keys" />
            ) : keys.isError ? (
              <p className="text-sm text-destructive">Couldn't load your keys. Check your connection and reload.</p>
            ) : list.length === 0 ? (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No keys yet. Create one to get started.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {list.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{k.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{k.prefix}…</span> · created {new Date(k.createdAt).toLocaleDateString()} ·{" "}
                        {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revoke.isPending}
                      onClick={() => { if (window.confirm(`Revoke "${k.name}"? Anything using it will stop working.`)) revoke.mutate(k.id); }}
                    >
                      <Trash2 /> Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <ApiUsagePanel />

        <section className="rise d-2 rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-medium">Use it with Claude</h2>
          <p className="mt-1 text-sm text-muted-foreground">Give your Claude session the key as the environment variable <code className="font-mono">VOICEVERSE_API_KEY</code>, then paste this:</p>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-secondary p-4 text-sm leading-relaxed">{CLAUDE_BRIEF}</pre>
          <div className="mt-3"><CopyButton text={CLAUDE_BRIEF} label="Copy instructions" /></div>
        </section>

        <section className="rise d-3 rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-medium">Try it</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-secondary p-4 text-xs leading-relaxed sm:text-sm">{CURL}</pre>
          <div className="mt-3"><CopyButton text={CURL} label="Copy command" /></div>
          <p className="mt-4 text-xs text-muted-foreground">Up to 25 texts per call, 120 requests a minute per key. Always check <code className="font-mono">translated</code> in the result.</p>
        </section>
      </div>
    </>
  );
}
