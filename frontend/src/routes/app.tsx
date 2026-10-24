import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Home, Mic, History, Languages, Settings, LifeBuoy, Radio, KeyRound, LogOut, Code2 } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Logo } from "@/components/vv/primitives";
import { Button } from "@/components/ui/button";
import { useAuth, useSignOut } from "@/lib/auth";
import { actions, useStore } from "@/lib/store";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Voice Verse — Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: AppLayout,
});

const NAV = [
  { to: "/app", label: "Dashboard", icon: Home, exact: true },
  { to: "/app/listen", label: "Start listening", icon: Mic },
  { to: "/app/join", label: "Join a session", icon: KeyRound },
  { to: "/app/host", label: "Host a session", icon: Radio, educatorOnly: true },
  { to: "/app/history", label: "History", icon: History },
  { to: "/app/languages", label: "Languages", icon: Languages },
  { to: "/app/developers", label: "Developers", icon: Code2 },
  { to: "/app/settings", label: "Settings", icon: Settings },
  { to: "/app/help", label: "Help", icon: LifeBuoy },
] as const;

function AppLayout() {
  const { user, loading } = useAuth({ required: true });
  const signOut = useSignOut();
  const compact = useStore((s) => s.settings.compactSidebar);
  const path = useLocation({ select: (l) => l.pathname });

  useEffect(() => { actions.pruneExpired(); }, []);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center" aria-busy="true">
        <div className="fade-in flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Loading your workspace…
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={!compact}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-4 py-4 group-data-[collapsible=icon]:px-2"><Logo className="group-data-[collapsible=icon]:gap-0" /></SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {NAV.filter((n) => !("educatorOnly" in n) || user.role === "educator").map((n) => {
                const active = "exact" in n && n.exact ? path === n.to : path.startsWith(n.to);
                return (
                  <SidebarMenuItem key={n.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={n.label}>
                      <Link to={n.to}><n.icon /><span>{n.label}</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-2 p-3">
          <div className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            <p className="truncate font-medium text-foreground">{user.name}</p>
            <p className="truncate">{user.email}</p>
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} tooltip="Sign out"><LogOut /><span>Sign out</span></SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger aria-label="Toggle navigation" className="h-10 w-10" />
          <span className="flex-1" />
          <Button size="sm" asChild><Link to="/app/listen"><Mic /> Start listening</Link></Button>
        </header>
        {/* key => each page change replays the entrance motion */}
        <main key={path} className="rise mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
