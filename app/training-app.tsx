"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Home,
  Layers3,
  Library,
  LogOut,
  PanelBottom,
  Settings,
  ShieldCheck,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { FeedView } from "@/components/training/feed-view";
import { HomeView } from "@/components/training/home-view";
import { MoreViewRouter } from "@/components/training/more-views";
import { ProgressView } from "@/components/training/progress-view";
import { TrainView } from "@/components/training/train-view";
import { WeekView } from "@/components/training/week-view";
import { CategoryBadge, formatDay } from "@/components/training/common";
import type { AppData, AppPayload, AppRoute, ClaimData, MainView, Mutate } from "@/lib/app-types";

const mainNav: Array<{ id: MainView; label: string; icon: typeof Home }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "week", label: "Week", icon: CalendarDays },
  { id: "train", label: "Train", icon: Dumbbell },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "feed", label: "Feed", icon: Activity },
];

const moreItems: Array<{ id: MainView; label: string; description: string; icon: typeof Trophy }> = [
  { id: "events", label: "Events & race reviews", description: "Countdowns, phases and race learning", icon: Trophy },
  { id: "blocks", label: "Training blocks", description: "Create the plan after London", icon: Layers3 },
  { id: "library", label: "Workout library", description: "Running and HYROX templates", icon: Library },
  { id: "coach", label: "Ask Coach", description: "AI-ready training context", icon: Bot },
  { id: "settings", label: "Settings", description: "Profile, units and preferences", icon: Settings },
];

type WindowKey = Exclude<MainView, "more"> | "partner";

const windowItems: Array<{ id: Exclude<MainView, "more">; label: string; title: string; icon: typeof Home; closeable: boolean }> = [
  { id: "home", label: "Home", title: "DUO / ENGINE Training Hub", icon: Home, closeable: false },
  { id: "week", label: "Week", title: "Shared Week Planner", icon: CalendarDays, closeable: false },
  { id: "train", label: "Train", title: "Training Queue", icon: Dumbbell, closeable: false },
  { id: "progress", label: "Progress", title: "Progress Monitor", icon: BarChart3, closeable: false },
  { id: "feed", label: "Feed", title: "Team Activity", icon: Activity, closeable: false },
  { id: "events", label: "Events", title: "Events & Race Reviews", icon: Trophy, closeable: true },
  { id: "blocks", label: "Blocks", title: "Training Blocks", icon: Layers3, closeable: true },
  { id: "library", label: "Workout Library", title: "Workout Library", icon: Library, closeable: true },
  { id: "coach", label: "Coach", title: "Ask Coach", icon: Bot, closeable: true },
  { id: "settings", label: "Settings", title: "Athlete Settings", icon: Settings, closeable: true },
];

const coreWindowKeys: WindowKey[] = ["home", "week", "train", "progress", "feed"];

function initialOpenWindows(): WindowKey[] {
  const initial = readRoute();
  const key = initial.view === "more" ? initial.origin : initial.view;
  return key && key !== "more" && !coreWindowKeys.includes(key)
    ? [...coreWindowKeys, key]
    : [...coreWindowKeys];
}

const routeViews = new Set<MainView>([
  "home",
  "week",
  "train",
  "progress",
  "feed",
  "events",
  "blocks",
  "library",
  "coach",
  "settings",
  "more",
]);

function readRoute(): AppRoute {
  if (typeof window === "undefined") return { view: "home" };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view") as MainView | null;
  const origin = params.get("origin") as MainView | null;
  const mode = params.get("mode");
  const weekAction = params.get("weekAction");
  return {
    view: requested && routeViews.has(requested) ? requested : "home",
    origin: origin && routeViews.has(origin) ? origin : undefined,
    sessionId: params.get("session") ?? undefined,
    mode: mode === "log" ? "log" : "overview",
    weekAction: weekAction === "add" || weekAction === "edit" ? weekAction : undefined,
    workoutId: params.get("workout") ?? undefined,
    eventId: params.get("event") ?? undefined,
    exerciseId: params.get("exercise") ?? undefined,
  };
}

function routeUrl(route: AppRoute) {
  const params = new URLSearchParams();
  if (route.view !== "home") params.set("view", route.view);
  if (route.origin) params.set("origin", route.origin);
  if (route.sessionId) params.set("session", route.sessionId);
  if (route.mode === "log") params.set("mode", "log");
  if (route.weekAction) params.set("weekAction", route.weekAction);
  if (route.workoutId) params.set("workout", route.workoutId);
  if (route.eventId) params.set("event", route.eventId);
  if (route.exerciseId) params.set("exercise", route.exerciseId);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function LoadingScreen({ name }: { name: string }) {
  return (
    <main className="app-loading">
      <div className="loading-brand"><span>DUO</span><i />ENGINE</div>
      <p>Preparing {name}’s training cockpit…</p>
      <div className="loading-card"><Skeleton className="h-4 w-28" /><Skeleton className="h-12 w-4/5" /><Skeleton className="h-4 w-full" /><Skeleton className="h-12 w-full" /></div>
      <div className="loading-grid"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
    </main>
  );
}

function ClaimProfile({
  data,
  onClaim,
}: {
  data: ClaimData;
  onClaim: (profileId: string) => Promise<void>;
}) {
  return (
    <main className="claim-screen">
      <section className="claim-card">
        <div className="claim-shield"><ShieldCheck aria-hidden="true" /></div>
        <p className="eyebrow">Secure first-time setup</p>
        <h1>Link your athlete profile</h1>
        <p>Signed in as <strong>{data.authenticatedName}</strong>. This one-time link prevents profile switching and keeps each athlete’s history separate.</p>
        <div className="claim-options">
          {data.availableProfiles.map((profile) => (
            <button type="button" key={profile.id} onClick={() => onClaim(profile.id)}>
              <div className="athlete-monogram">{profile.displayName.slice(0, 1)}</div>
              <span><strong>Continue as {profile.displayName}</strong><small>This ChatGPT sign-in will be bound to {profile.displayName}.</small></span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </div>
        {!data.availableProfiles.length ? <p className="claim-warning">Both athlete profiles are already linked. Ask the Site owner to check access.</p> : null}
        <small className="claim-footnote">This is not a reusable profile selector. After linking, the app opens automatically as you.</small>
      </section>
    </main>
  );
}

function PartnerSheet({
  data,
  open,
  onOpenChange,
  onNavigate,
}: {
  data: AppData;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onNavigate: (view: MainView) => void;
}) {
  const partner = data.partner;
  if (!partner) return null;
  const upcoming = data.sessions
    .filter((session) => session.athleteId === partner.id && session.status === "planned")
    .slice(0, 4);
  const recent = data.recentSessions.filter((session) => session.athleteId === partner.id).slice(0, 4);
  const progress = data.progress[partner.id] ?? [];
  const activity = data.feed.filter((item) => item.athleteId === partner.id).slice(0, 3);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="partner-sheet">
        <SheetHeader>
          <div className="partner-window-title"><Users aria-hidden="true" /><SheetTitle>{partner.displayName} — Partner Pulse</SheetTitle></div>
          <SheetDescription>Private shared team utility</SheetDescription>
        </SheetHeader>
        <div className="partner-sheet-scroll">
          <div className="partner-profile-head"><div className="partner-avatar">{partner.displayName.slice(0, 1)}</div><div><span>Training partner</span><strong>{partner.displayName}</strong><small>DUO / ENGINE teammate</small></div></div>
          <section><h3>Current week</h3>{data.week.confirmedAt ? <div className="partner-targets"><span>Hard <strong>{data.totals[partner.id]?.completed.hard ?? 0}/{data.week.hardTarget}</strong></span><span>Strength <strong>{data.totals[partner.id]?.completed.strength ?? 0}/{data.week.strengthTarget}</strong></span><span>Easy <strong>{data.totals[partner.id]?.completed.easy ?? 0}/{data.week.easyTarget}</strong></span></div> : <p className="muted-panel">{data.week.title} is recommended. The shared week is not set yet.</p>}</section>
          <section><h3>Recent activity</h3>{activity.length ? <div className="partner-activity-list">{activity.map((item) => <div key={item.id}><Bell aria-hidden="true" /><span><strong>{item.message}</strong><small>{new Date(item.createdAt).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}</small></span></div>)}</div> : <p className="muted-panel">No recent partner activity.</p>}</section>
          <section><h3>Upcoming sessions</h3><div className="partner-list">{upcoming.map((session) => <div key={session.id}><i className={`tone-dot tone-${session.category}`} /><span><strong>{session.title}</strong><small>{formatDay(session.scheduledDate)} · {session.assignment}</small></span></div>)}</div></section>
          <section><h3>Recent sessions</h3>{recent.length ? <div className="partner-list">{recent.map((session) => <div key={session.id}><CategoryBadge category={session.category} compact /><span><strong>{session.title}</strong><small>RPE {session.rpe ?? "—"}{session.averagePace ? ` · ${session.averagePace}/km` : ""}</small></span></div>)}</div> : <p className="muted-panel">No completed sessions yet.</p>}</section>
          <section><h3>Recent progression</h3>{progress.length ? <div className="partner-list">{progress.slice(0, 4).map((item) => <div key={item.exerciseId}><Target /><span><strong>{item.exerciseName}</strong><small>{item.currentLoadKg} kg{item.recommendedLoadKg ? ` · try ${item.recommendedLoadKg} kg` : ""}</small></span></div>)}</div> : <p className="muted-panel">Strength progressions will appear after logging.</p>}</section>
        </div>
        <SheetFooter className="partner-sheet-actions"><Button onClick={() => { onOpenChange(false); onNavigate("feed"); }}><Activity /> Open full Feed</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StartMenuSheet({
  open,
  onOpenChange,
  onNavigate,
  actorName,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onNavigate: (view: MainView) => void;
  actorName: string;
}) {
  const choose = (view: MainView) => {
    onNavigate(view);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="start-menu-sheet" side="bottom">
        <SheetHeader className="start-menu-titlebar"><SheetTitle>DUO / ENGINE Launcher</SheetTitle><SheetDescription>{actorName}’s training workstation</SheetDescription></SheetHeader>
        <div className="start-menu-body">
          <div className="start-menu-brand" aria-hidden="true"><span>DUO</span><strong>ENGINE</strong></div>
          <div className="start-menu-groups">
            <nav className="start-menu-primary" aria-label="Primary destinations">
              {mainNav.map((item) => {
                const Icon = item.icon;
                return <button type="button" key={item.id} onClick={() => choose(item.id)}><span><Icon /></span><strong>{item.label}</strong><ChevronRight /></button>;
              })}
            </nav>
            <nav className="more-menu" aria-label="Tools and settings">
          {moreItems.map((item) => {
            const Icon = item.icon;
            return <button type="button" key={item.id} onClick={() => choose(item.id)}><span><Icon /></span><div><strong>{item.label}</strong><small>{item.description}</small></div><ChevronRight /></button>;
          })}
            </nav>
          </div>
        </div>
        <SheetFooter className="start-menu-footer"><a className="sign-out-link" href="/signout-with-chatgpt?return_to=%2F" target="_top"><LogOut /> Sign out of ChatGPT</a></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function TrainingApp({
  authenticatedUser,
}: {
  authenticatedUser: { email: string; displayName: string; fullName: string | null };
}) {
  const [payload, setPayload] = useState<AppPayload | null>(null);
  const [error, setError] = useState("");
  const [route, setRoute] = useState<AppRoute>(() => readRoute());
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [openWindows, setOpenWindows] = useState<WindowKey[]>(initialOpenWindows);
  const [partnerSeenAt, setPartnerSeenAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (weekId?: string | null) => {
    try {
      setError("");
      const query = weekId ? `?weekId=${encodeURIComponent(weekId)}` : "";
      const response = await fetch(`/api/app${query}`, { cache: "no-store" });
      const next = (await response.json()) as AppPayload & { error?: string };
      if (!response.ok) throw new Error(next.error || "Unable to load training data.");
      setPayload(next);
      if (!next.needsProfileClaim) setSelectedWeekId(next.week.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the app.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = readRoute();
      setRoute(nextRoute);
      const key = nextRoute.view === "more" ? nextRoute.origin : nextRoute.view;
      if (key && key !== "more") {
        setOpenWindows((current) => current.includes(key) ? current : [...current, key]);
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!payload || payload.needsProfileClaim) return;
    document.documentElement.style.setProperty("--active-title", payload.actor.titleBarColor ?? "#000080");
  }, [payload]);

  const mutate: Mutate = useCallback(
    async (body, successMessage) => {
      setSaving(true);
      try {
        const response = await fetch("/api/app", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await response.json()) as { error?: string; ok?: boolean; undoToken?: string; [key: string]: unknown };
        if (!response.ok) throw new Error(result.error || "The change could not be saved.");
        await load(selectedWeekId);
        if (successMessage) {
          if (result.undoToken) {
            toast.success(successMessage, {
              duration: 9000,
              action: {
                label: "Undo",
                onClick: async () => {
                  const undoResponse = await fetch("/api/app", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "undoPlanChange", historyId: result.undoToken }),
                  });
                  const undoResult = (await undoResponse.json()) as { error?: string };
                  if (!undoResponse.ok) {
                    toast.error(undoResult.error || "That change could not be undone.");
                    return;
                  }
                  await load(selectedWeekId);
                  toast.success("Plan change undone");
                },
              },
            });
          } else {
            toast.success(successMessage);
          }
        }
        return result;
      } catch (mutationError) {
        const message = mutationError instanceof Error ? mutationError.message : "The change could not be saved.";
        toast.error(message);
        throw mutationError;
      } finally {
        setSaving(false);
      }
    },
    [load, selectedWeekId],
  );

  const claim = async (profileId: string) => {
    setSaving(true);
    try {
      const response = await fetch("/api/app", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "claimProfile", profileId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Profile could not be linked.");
      await load();
      toast.success("Athlete profile linked securely");
    } catch (claimError) {
      toast.error(claimError instanceof Error ? claimError.message : "Profile could not be linked.");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <main className="error-screen"><div><Activity /><h1>Training data could not load</h1><p>{error}</p><Button onClick={() => load()}>Try again</Button></div></main>
    );
  }
  if (!payload) return <LoadingScreen name={authenticatedUser.fullName ?? authenticatedUser.displayName} />;
  if (payload.needsProfileClaim) return <><ClaimProfile data={payload} onClaim={claim} /><Toaster richColors position="top-center" /></>;

  const data = payload;
  const surfaceView = route.view === "more"
    ? (route.origin && route.origin !== "more" ? route.origin : "home")
    : route.view;
  const isMoreView = !mainNav.some((item) => item.id === surfaceView);
  const currentWindow = windowItems.find((item) => item.id === surfaceView) ?? windowItems[0];
  const CurrentWindowIcon = currentWindow.icon;
  const detailOpen = Boolean(route.sessionId || route.workoutId || route.eventId || route.exerciseId);
  const effectivePartnerSeenAt = partnerSeenAt ?? window.sessionStorage.getItem(`duo-engine-partner-seen-${data.actor.id}`);
  const partnerActivityCount = data.partner
    ? Math.min(9, data.feed.filter((item) => item.athleteId === data.partner?.id && (!effectivePartnerSeenAt || item.createdAt > effectivePartnerSeenAt)).length)
    : 0;
  const goTo = (next: MainView, details: Partial<AppRoute> = {}, replace = false) => {
    const nextRoute: AppRoute = { view: next, ...details };
    if (next !== "more") {
      setOpenWindows((current) => current.includes(next as WindowKey) ? current : [...current, next as WindowKey]);
    }
    window.history[replace ? "replaceState" : "pushState"]({ route: nextRoute }, "", routeUrl(nextRoute));
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: replace ? "auto" : "smooth" });
  };
  const goBack = () => window.history.back();
  const openPartner = () => {
    if (!data.partner) return;
    setOpenWindows((current) => current.includes("partner") ? current : [...current, "partner"]);
    setPartnerOpen(true);
    const seenAt = new Date().toISOString();
    setPartnerSeenAt(seenAt);
    window.sessionStorage.setItem(`duo-engine-partner-seen-${data.actor.id}`, seenAt);
  };
  const closeWindow = (key: WindowKey) => {
    setOpenWindows((current) => current.filter((item) => item !== key));
    if (key === "partner") {
      setPartnerOpen(false);
      return;
    }
    if (surfaceView === key) {
      const fallback = route.origin && route.origin !== "more" && route.origin !== key ? route.origin : "home";
      goTo(fallback, {}, true);
    }
  };
  const selectWeek = async (weekId: string) => {
    setSelectedWeekId(weekId);
    await load(weekId);
  };

  return (
    <div className="training-app">
      {saving ? <div className="save-indicator"><span /></div> : null}
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-lockup" aria-label="Duo Engine shared HYROX training"><strong>DUO</strong><i />ENGINE<span>Mixed doubles · 2026</span></div>
          <div className="workstation-status"><span className="workstation-status-dot" /><strong>{data.actor.displayName}</strong><small>WORKSTATION READY</small></div>
        </div>
      </header>

      <main className="app-main">
        <section className="workspace-window">
          <div className="workspace-titlebar">
            <div className="workspace-title-leading">
              {isMoreView || detailOpen ? <button type="button" onClick={goBack} aria-label="Back to previous screen"><ArrowLeft /></button> : <CurrentWindowIcon aria-hidden="true" />}
              <span>{currentWindow.title}</span>
            </div>
            <div className="workspace-title-controls">
              <span aria-hidden="true">_</span>
              {currentWindow.closeable ? <button type="button" onClick={() => closeWindow(currentWindow.id)} aria-label={`Close ${currentWindow.label}`}><X /></button> : <span aria-hidden="true">□</span>}
            </div>
          </div>
          <div className="workspace-window-body">
            {surfaceView === "home" ? <HomeView data={data} onNavigate={(view, details) => goTo(view, details)} /> : null}
            {surfaceView === "week" ? <WeekView key={data.week.id} data={data} mutate={mutate} route={route} onNavigate={goTo} onBack={goBack} onSelectWeek={selectWeek} /> : null}
            {surfaceView === "train" ? <TrainView data={data} mutate={mutate} route={route} onNavigate={goTo} /> : null}
            {surfaceView === "progress" ? <ProgressView data={data} mutate={mutate} route={route} onNavigate={goTo} onBack={goBack} /> : null}
            {surfaceView === "feed" ? <FeedView data={data} mutate={mutate} onRefresh={() => load(selectedWeekId)} /> : null}
            {isMoreView ? <MoreViewRouter view={surfaceView} data={data} mutate={mutate} route={route} onNavigate={goTo} onBack={goBack} /> : null}
          </div>
        </section>
      </main>

      <nav className="desktop-taskbar" aria-label="Open training windows">
        <button type="button" className={route.view === "more" ? "start-button start-button-active" : "start-button"} onClick={() => route.view === "more" ? goBack() : goTo("more", { origin: surfaceView })} aria-expanded={route.view === "more"}><PanelBottom /><strong>DUO</strong><span>Start</span></button>
        <div className="taskbar-open-items">
          {openWindows.map((key) => {
            const item = key === "partner"
              ? { id: "partner" as const, label: `${data.partner?.displayName ?? "Partner"} Profile`, icon: Users, closeable: true }
              : (() => {
                const base = windowItems.find((entry) => entry.id === key);
                if (!base || key !== "train") return base;
                const session = route.sessionId ? data.sessions.find((entry) => entry.id === route.sessionId) : null;
                const label = session?.workoutKind === "strength-a" ? "Strength A" : session?.workoutKind === "strength-b" ? "Strength B" : base.label;
                return { ...base, label };
              })();
            if (!item) return null;
            const Icon = item.icon;
            const active = key === "partner" ? partnerOpen : surfaceView === key && route.view !== "more";
            return <div className={`${active ? "taskbar-item-shell taskbar-item-active" : "taskbar-item-shell"} taskbar-item-${key}`} key={key}><button type="button" className="taskbar-window-button" onClick={() => key === "partner" ? openPartner() : goTo(key)}><Icon /><span>{item.label}</span></button>{item.closeable ? <button className="taskbar-close-button" type="button" onClick={() => closeWindow(key)} aria-label={`Close ${item.label}`}><X /></button> : null}</div>;
          })}
        </div>
        {data.partner ? <button type="button" className={partnerOpen ? "system-tray-button system-tray-active" : "system-tray-button"} onClick={openPartner} aria-label={`Open ${data.partner.displayName} partner pulse${partnerActivityCount ? `, ${partnerActivityCount} new items` : ""}`}><Users /><span>{data.partner.displayName}</span>{partnerActivityCount ? <strong>{partnerActivityCount}</strong> : <i />}</button> : null}
      </nav>

      <PartnerSheet data={data} open={partnerOpen} onOpenChange={(open) => open ? openPartner() : closeWindow("partner")} onNavigate={(view) => goTo(view)} />
      <StartMenuSheet
        open={route.view === "more"}
        onOpenChange={(open) => {
          if (!open && route.view === "more") goBack();
        }}
        onNavigate={(view) => goTo(view, { origin: surfaceView }, true)}
        actorName={data.actor.displayName}
      />
      <Toaster richColors position="top-center" />
    </div>
  );
}
