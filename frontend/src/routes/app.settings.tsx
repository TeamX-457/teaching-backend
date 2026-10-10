import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LangSelect, SettingRow } from "@/components/vv/fields";
import { PageHeader } from "@/components/vv/primitives";
import { useAuth, useLanguages, useSignOut } from "@/lib/auth";
import { actions, useStore, type Settings } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Settings — Voice Verse" }] }),
  component: SettingsPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rise rounded-xl border bg-card px-5">
      <h2 className="border-b py-4 text-sm font-medium">{title}</h2>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Pick<K extends keyof Settings>({ k, options }: { k: K; options: [Settings[K], string][] }) {
  const s = useStore((st) => st.settings);
  return (
    <Select value={String(s[k])} onValueChange={(v) => actions.updateSettings({ [k]: options.find(([o]) => String(o) === v)![0] } as Partial<Settings>)}>
      <SelectTrigger className="w-40" aria-label={String(k)}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={String(v)} value={String(v)}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function SettingsPage() {
  const s = useStore((st) => st.settings);
  const sessions = useStore((st) => st.sessions.length);
  const { user } = useAuth();
  const signOut = useSignOut();
  const langs = useLanguages().data?.languages ?? [];

  return (
    <>
      <PageHeader title="Settings" description="Saved automatically on this device." />
      <div className="max-w-2xl space-y-6">
        <Section title="Languages">
          <div className="grid gap-5 py-5 sm:grid-cols-2">
            <LangSelect label="Default: language spoken" value={s.inputLang} onChange={(v) => actions.updateSettings({ inputLang: v })} langs={langs} filter={(l) => l.speechRecognition.supported} />
            <LangSelect label="Default: language I understand" value={s.outputLang} onChange={(v) => actions.updateSettings({ outputLang: v })} langs={langs} filter={(l) => l.translation} />
          </div>
        </Section>

        <Section title="Audio">
          <SettingRow title="Speak translations aloud" description="Uses voices on your device."><Switch checked={s.audioOutput} onCheckedChange={(v) => actions.updateSettings({ audioOutput: v })} aria-label="Speak translations aloud" /></SettingRow>
          <SettingRow title="Speaking speed"><Pick k="playbackRate" options={[[0.8, "Slower"], [1, "Normal"], [1.2, "Faster"], [1.5, "Fastest"]]} /></SettingRow>
          <SettingRow title="Remind me to use headphones" description="A tip appears while audio is on."><Switch checked={s.preferHeadphones} onCheckedChange={(v) => actions.updateSettings({ preferHeadphones: v })} aria-label="Headphone reminder" /></SettingRow>
        </Section>

        <Section title="Accessibility & appearance">
          <SettingRow title="Interface text size"><Pick k="textSize" options={[["default", "Default"], ["large", "Large"], ["xl", "Extra large"]]} /></SettingRow>
          <div className="py-4">
            <p className="text-sm font-medium">Subtitle size · {s.subtitleSize}px</p>
            <Slider className="mt-4" min={16} max={56} step={2} value={[s.subtitleSize]} onValueChange={([v]) => actions.updateSettings({ subtitleSize: v! })} aria-label="Subtitle size" />
            <p className="mt-4 rounded-lg bg-secondary px-4 py-3 leading-snug" style={{ fontSize: s.subtitleSize }}>Every voice in the room.</p>
          </div>
          <SettingRow title="High contrast"><Switch checked={s.highContrast} onCheckedChange={(v) => actions.updateSettings({ highContrast: v })} aria-label="High contrast" /></SettingRow>
          <SettingRow title="Reduce motion" description="Turns off animations."><Switch checked={s.reducedMotion} onCheckedChange={(v) => actions.updateSettings({ reducedMotion: v })} aria-label="Reduce motion" /></SettingRow>
          <SettingRow title="Theme"><Pick k="theme" options={[["light", "Light"], ["dark", "Dark"], ["system", "Match device"]]} /></SettingRow>
          <SettingRow title="Compact sidebar" description="Applies next time you open the app."><Switch checked={s.compactSidebar} onCheckedChange={(v) => actions.updateSettings({ compactSidebar: v })} aria-label="Compact sidebar" /></SettingRow>
        </Section>

        <Section title="Privacy">
          <SettingRow title="Save session history" description="Transcripts stay on this device. Audio is never stored."><Switch checked={s.saveHistory} onCheckedChange={(v) => actions.updateSettings({ saveHistory: v })} aria-label="Save session history" /></SettingRow>
          <SettingRow title="Keep sessions for"><Pick k="retention" options={[["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["forever", "Until I delete"]]} /></SettingRow>
          <SettingRow title="Delete all saved sessions" description={`${sessions} saved on this device.`}>
            <Button variant="outline" size="sm" disabled={!sessions} onClick={() => { actions.clearSessions(); toast.success("All sessions deleted."); }}>Delete</Button>
          </SettingRow>
        </Section>

        <Section title="Account">
          <SettingRow title={user?.name ?? "Account"} description={user ? `${user.email} · ${user.role === "educator" ? "Speaker" : "Listener"}` : ""}>
            <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
          </SettingRow>
        </Section>
      </div>
    </>
  );
}
