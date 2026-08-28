"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Edit3,
  History,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AppData,
  AppRoute,
  Category,
  LibraryItem,
  MainView,
  Mutate,
  Session,
} from "@/lib/app-types";
import { AthleteToggle, categoryMeta, CategoryBadge, formatDay, SectionHeading, TargetBars } from "./common";

const categories: Category[] = ["hard", "strength", "easy", "recovery"];
type Navigate = (view: MainView, details?: Partial<AppRoute>, replace?: boolean) => void;

function TargetStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="target-stepper">
      <span>{label}</span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Decrease ${label}`}>
          −
        </button>
        <strong>{value}</strong>
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

const workoutFilters = ["favourites", "running", "hyrox", "easy", "hard", "strength", "recent"] as const;

function WorkoutPicker({
  items,
  selectedId,
  onSelect,
}: {
  items: LibraryItem[];
  selectedId: string;
  onSelect: (item: LibraryItem) => void;
}) {
  const [filter, setFilter] = useState<(typeof workoutFilters)[number]>("favourites");
  const filtered = items.filter((item) => {
    if (filter === "favourites") return item.favourite;
    if (filter === "recent") return item.isRecent;
    if (filter === "running" || filter === "hyrox") return item.family === filter;
    return item.category === filter;
  });
  const visible = filtered.length ? filtered : items;
  return (
    <div className="workout-picker">
      <div className="workout-filter-row" aria-label="Workout filters">
        {workoutFilters.map((item) => (
          <button type="button" className={filter === item ? "workout-filter-active" : ""} onClick={() => setFilter(item)} key={item}>
            {item === "favourites" ? <Star aria-hidden="true" /> : null}{item}
          </button>
        ))}
      </div>
      {!filtered.length ? <p className="picker-empty">No {filter} workouts yet. Showing the full library.</p> : null}
      <div className="workout-picker-list">
        {visible.map((item) => (
          <button type="button" className={selectedId === item.id ? "workout-pick workout-pick-active" : "workout-pick"} onClick={() => onSelect(item)} key={item.id}>
            <span><CategoryBadge category={item.category} compact />{item.favourite ? <Star className="favourite-star" aria-hidden="true" /> : null}</span>
            <strong>{item.name}</strong>
            <small>{item.prescription}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionEditor({
  session,
  open,
  onOpenChange,
  library,
  mutate,
}: {
  session: Session;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  library: LibraryItem[];
  mutate: Mutate;
}) {
  const [title, setTitle] = useState(session.title);
  const [scheduledDate, setScheduledDate] = useState(session.scheduledDate);
  const [category, setCategory] = useState<Category>(session.category);
  const [workoutKind, setWorkoutKind] = useState(session.workoutKind);
  const [details, setDetails] = useState(session.details);
  const [scope, setScope] = useState("me");
  const [workoutId, setWorkoutId] = useState(session.workoutTemplateId ?? "");

  const chooseReplacement = (id: string) => {
    if (id === "rest") {
      setWorkoutId("");
      setTitle("Rest / recovery");
      setCategory("recovery");
      setWorkoutKind("rest");
      setDetails("No training target attached. Recover and adapt as needed.");
      return;
    }
    const replacement = library.find((item) => item.id === id);
    if (!replacement) return;
    setWorkoutId(replacement.id);
    setTitle(replacement.name);
    setCategory(replacement.category);
    setWorkoutKind(replacement.family === "hyrox" ? "hyrox" : replacement.category === "easy" ? "easy" : "run-quality");
    setDetails(replacement.prescription);
  };

  const save = async () => {
    await mutate(
      {
        action: "changeSession",
        sessionId: session.id,
        title,
        scheduledDate,
        category,
        workoutKind,
        details,
        workoutId,
        scope,
      },
      scope === "both" ? "Both plans updated" : "Your plan updated",
    );
    onOpenChange(false);
  };

  const remove = async () => {
    await mutate(
      { action: "removeSession", sessionId: session.id, scope },
      scope === "both" ? "Session removed from both plans" : "Session removed from your plan",
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="training-dialog routed-session-editor"
        style={{
          /* This editor is a routed screen on touch devices. Keep these
             geometry values inline so browser/device viewport quirks cannot
             collapse the portal into a half-width dialog. */
          inset: 0,
          width: "100vw",
          maxWidth: "none",
          height: "100dvh",
          maxHeight: "100dvh",
          transform: "none",
          borderRadius: 0,
          border: 0,
          boxShadow: "none",
        }}
      >
        <DialogHeader>
          <DialogTitle>Move or replace session</DialogTitle>
          <DialogDescription>
            The original shared plan stays visible. This changes the current plan and recalculates warnings.
          </DialogDescription>
        </DialogHeader>
        <div className="dialog-form-grid">
          <section className="dialog-section current-session-summary">
            <h3>Current session</h3>
            <div><strong>{session.title}</strong><span>{formatDay(session.scheduledDate)} · {categoryMeta[session.category].label} · {session.assignment === "together" ? "Together" : "Individual"}</span></div>
          </section>
          <section className="dialog-section">
            <h3>Replace with</h3>
            <WorkoutPicker items={library} selectedId={workoutId} onSelect={(item) => chooseReplacement(item.id)} />
            <Button type="button" variant="outline" size="sm" onClick={() => chooseReplacement("rest")}>Use Rest / Recovery instead</Button>
          </section>
          <section className="dialog-section">
            <h3>Or modify current session</h3>
            <div className="field-stack"><Label htmlFor="session-title">Session name</Label><Input id="session-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
            <div className="two-field-grid">
              <div className="field-stack"><Label htmlFor="session-date">Date</Label><Input id="session-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></div>
              <div className="field-stack"><Label htmlFor="session-category">Category</Label><Select value={category} onValueChange={(value) => setCategory(value as Category)}><SelectTrigger id="session-category" className="full-select"><SelectValue /></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem value={item} key={item}>{categoryMeta[item].label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="field-stack"><Label htmlFor="session-details">Session details</Label><Textarea id="session-details" value={details} onChange={(event) => setDetails(event.target.value)} /></div>
          </section>
          <section className="dialog-section">
            <h3>Apply change to</h3>
            <RadioGroup value={scope} onValueChange={setScope} className="scope-options">
              <Label className="scope-option" htmlFor="scope-me">
                <RadioGroupItem id="scope-me" value="me" />
                <span>
                  <strong>Change my plan</strong>
                  <small>Your partner’s plan stays unchanged.</small>
                </span>
              </Label>
              <Label className="scope-option" htmlFor="scope-both">
                <RadioGroupItem id="scope-both" value="both" disabled={!session.sharedSessionId} />
                <span>
                  <strong>Apply change to both</strong>
                  <small>Updates the shared plan and both athlete schedules.</small>
                </span>
              </Label>
            </RadioGroup>
          </section>
        </div>
        <DialogFooter className="dialog-actions-split">
          <Button variant="destructive" onClick={remove}>
            <Trash2 aria-hidden="true" /> Remove session
          </Button>
          <Button onClick={save}>Save change</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSessionDialog({
  data,
  open,
  onOpenChange,
  mutate,
}: {
  data: AppData;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  mutate: Mutate;
}) {
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [scheduledDate, setScheduledDate] = useState(data.week.startDate);
  const [scope, setScope] = useState("me");

  const save = async () => {
    await mutate(
      {
        action: "addSession",
        weekId: data.week.id,
        workoutId: selected?.id,
        scheduledDate,
        scope,
      },
      scope === "both" ? "Session added to both plans" : "Session added to your plan",
    );
    setSelected(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="training-dialog routed-session-editor"
        style={{
          inset: 0,
          width: "100vw",
          maxWidth: "none",
          height: "100dvh",
          maxHeight: "100dvh",
          transform: "none",
          borderRadius: 0,
          border: 0,
          boxShadow: "none",
        }}
      >
        <DialogHeader>
          <DialogTitle>Add a session</DialogTitle>
          <DialogDescription>Choose a reusable workout, day and athlete scope. Weekly warnings update automatically.</DialogDescription>
        </DialogHeader>
        <div className="dialog-form-grid">
          <div className="field-stack">
            <Label>Workout Library</Label>
            <WorkoutPicker items={data.workoutLibrary} selectedId={selected?.id ?? ""} onSelect={setSelected} />
          </div>
          {selected ? <div className="selected-workout-summary"><CategoryBadge category={selected.category} compact /><strong>{selected.name}</strong><span>{selected.prescription}</span></div> : null}
          <div className="field-stack"><Label htmlFor="add-date">Day</Label><Input id="add-date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></div>
          <RadioGroup value={scope} onValueChange={setScope} className="scope-options">
            <Label className="scope-option" htmlFor="add-me"><RadioGroupItem id="add-me" value="me" /><span><strong>Add to my plan</strong><small>Individual only.</small></span></Label>
            <Label className="scope-option" htmlFor="add-both"><RadioGroupItem id="add-both" value="both" /><span><strong>Add for both</strong><small>Creates linked athlete sessions.</small></span></Label>
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={!selected}>Add workout</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WeekView({
  data,
  mutate,
  route,
  onNavigate,
  onBack,
  onSelectWeek,
}: {
  data: AppData;
  mutate: Mutate;
  route: AppRoute;
  onNavigate: Navigate;
  onBack: () => void;
  onSelectWeek: (weekId: string) => void;
}) {
  const [perspective, setPerspective] = useState(data.actor.id);
  const [targetEditOpen, setTargetEditOpen] = useState(false);
  const [resetDialog, setResetDialog] = useState<"me" | "shared" | null>(null);
  const [unsetConfirmOpen, setUnsetConfirmOpen] = useState(false);
  const [resettingScope, setResettingScope] = useState<"me" | "both" | null>(null);
  const [historyTab, setHistoryTab] = useState<"original" | "thomas" | "kt" | "history">("original");
  const [draftType, setDraftType] = useState(data.week.weekType);
  const [targets, setTargets] = useState({
    hard: data.week.hardTarget,
    strength: data.week.strengthTarget,
    easy: data.week.easyTarget,
  });

  const isWeekSet = Boolean(data.week.confirmedAt);
  const selectedSession = route.weekAction === "edit"
    ? data.sessions.find((session) => session.id === route.sessionId) ?? null
    : null;
  const editorOpen = Boolean(selectedSession);
  const addOpen = route.weekAction === "add";
  const athleteSessions = data.sessions
    .filter((session) => session.athleteId === perspective && session.status !== "removed")
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.sortOrder - b.sortOrder);
  const totals = data.totals[perspective] ?? data.totals[data.actor.id];
  const hardOverTarget = isWeekSet && totals.planned.hard > data.week.hardTarget;
  const weekEnded = data.serverDate > new Date(new Date(`${data.week.startDate}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
  const results = athleteSessions.filter((session) => session.status === "completed");
  const averageRpe = results.length
    ? (results.reduce((sum, session) => sum + (session.rpe ?? 0), 0) / results.length).toFixed(1)
    : "—";
  const planDetailRows = historyTab === "original"
    ? data.originalPlan
    : historyTab === "history"
      ? []
      : data.sessions
          .filter((session) => session.athleteId === historyTab && session.status !== "removed")
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.sortOrder - b.sortOrder);
  const myCompletedSessions = data.sessions.filter(
    (session) => session.status === "completed" && session.athleteId === data.actor.id,
  );
  const allCompletedSessions = data.sessions.filter((session) => session.status === "completed");
  const eventInWeek = data.events.find(
    (event) => event.eventDate >= data.week.startDate && event.eventDate <= new Date(new Date(`${data.week.startDate}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10),
  );

  const updateTemplateTargets = (value: string) => {
    setDraftType(value);
    const defaults = data.weekTypes[value]?.targets;
    if (defaults) setTargets(defaults);
  };

  const saveTemplate = (successMessage?: string) =>
    mutate(
      {
        action: "setWeekType",
        weekId: data.week.id,
        weekType: draftType,
        hardTarget: targets.hard,
        strengthTarget: targets.strength,
        easyTarget: targets.easy,
      },
      successMessage,
    );

  const confirmSharedWeek = async () => {
    await saveTemplate();
    await mutate(
      { action: "confirmWeek", weekId: data.week.id },
      "Shared week set for Thomas and KT",
    );
  };

  const openEditor = (session: Session) => {
    onNavigate("week", { weekAction: "edit", sessionId: session.id });
  };

  const openTargetEditor = () => {
    setTargets({ hard: data.week.hardTarget, strength: data.week.strengthTarget, easy: data.week.easyTarget });
    setTargetEditOpen(true);
  };

  const saveTargets = async () => {
    await mutate(
      {
        action: "updateWeeklyTargets",
        weekId: data.week.id,
        hardTarget: targets.hard,
        strengthTarget: targets.strength,
        easyTarget: targets.easy,
      },
      "Weekly targets updated",
    );
    setTargetEditOpen(false);
  };

  const resetPlan = async (scope: "me" | "both") => {
    setResettingScope(scope);
    try {
      await mutate(
        { action: "resetPlan", weekId: data.week.id, scope },
        scope === "both" ? "Both plans restored to the shared week" : "Your plan reset to the shared week",
      );
      setResetDialog(null);
    } finally {
      setResettingScope(null);
    }
  };

  const unsetWeek = async () => {
    await mutate(
      { action: "unsetWeek", weekId: data.week.id },
      "Shared week reset and returned to planning",
    );
    setUnsetConfirmOpen(false);
    setResetDialog(null);
  };

  const planningStateLabel = {
    recommended: "Recommended",
    set: "Set",
    in_progress: "In progress",
    complete: "Complete",
  }[data.week.planningState];

  return (
    <div className="view-stack">
      <section className="week-header-card">
        <div>
          <p className="eyebrow">{data.phase?.name ?? "Training block"}</p>
          <h1>{data.week.title}</h1>
          <p>{data.week.rationale}</p>
        </div>
        <div className="week-picker-row">
          <Select value={data.week.id} onValueChange={onSelectWeek}>
            <SelectTrigger className="week-picker"><SelectValue /></SelectTrigger>
            <SelectContent>
              {data.weeks.map((week) => (
                <SelectItem value={week.id} key={week.id}>W/C {formatDay(week.startDate, { weekday: undefined })} · {week.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className={`plan-state plan-state-${data.week.planningState}`}>
            {data.week.planningState === "recommended" ? <Clock3 aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            {planningStateLabel}
          </span>
        </div>
      </section>

      {!isWeekSet ? (
        <section className="performance-card planner-card">
          <SectionHeading eyebrow="Training-block recommendation" title="Plan this week" />
          <div className="recommended-state-panel">
            <Clock3 aria-hidden="true" />
            <div><strong>This week has not been set</strong><span>Review the recommendation, adjust the targets if needed, then agree the shared week.</span></div>
          </div>
          <div className="field-stack">
            <Label htmlFor="week-type">Week type</Label>
            <Select value={draftType} onValueChange={updateTemplateTargets}>
              <SelectTrigger id="week-type" className="full-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(data.weekTypes).map(([key, value]) => (
                  <SelectItem value={key} key={key}>{value.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="planner-rationale">{data.weekTypes[draftType]?.rationale}</p>
          <div className="planner-context-row">
            <span><strong>Phase</strong>{data.phase?.name ?? "Training block"}</span>
            <span><strong>Quality focus</strong>{data.week.qualityFocus || "Recover and adapt"}</span>
            {eventInWeek ? <span><strong>Event context</strong>{eventInWeek.name}</span> : null}
          </div>
          <p className="recommended-target-label">Recommended weekly targets</p>
          <div className="stepper-grid">
            <TargetStepper label="Hard Conditioning" value={targets.hard} onChange={(hard) => setTargets((current) => ({ ...current, hard }))} />
            <TargetStepper label="Strength" value={targets.strength} onChange={(strength) => setTargets((current) => ({ ...current, strength }))} />
            <TargetStepper label="Easy Aerobic" value={targets.easy} onChange={(easy) => setTargets((current) => ({ ...current, easy }))} />
          </div>
          <div className="planner-actions">
            <Button variant="outline" onClick={() => saveTemplate("Week recommendation updated")}>Update recommendation</Button>
            <Button onClick={confirmSharedWeek}>
              <Users aria-hidden="true" /> Set shared week
            </Button>
          </div>
        </section>
      ) : (
        <section className="week-management-row" aria-label="Shared week controls">
          <Button variant="outline" size="sm" onClick={openTargetEditor}><Edit3 /> Edit weekly targets</Button>
          <Button variant="outline" size="sm" onClick={() => setResetDialog("me")}><RotateCcw /> Reset my plan</Button>
          <Button variant="outline" size="sm" onClick={() => setResetDialog("shared")}><Users /> Reset week…</Button>
        </section>
      )}

      {isWeekSet && (hardOverTarget || totals.consecutiveHard) ? (
        <section className="warning-stack" aria-label="Training rule warnings">
          {hardOverTarget ? (
            <div className="rule-warning">
              <AlertTriangle aria-hidden="true" />
              <div><strong>{totals.planned.hard} hard sessions planned · target {data.week.hardTarget}</strong><span>The plan exceeds this week’s Hard Conditioning target. Training is not blocked.</span></div>
            </div>
          ) : null}
          {totals.consecutiveHard ? (
            <div className="rule-warning">
              <AlertTriangle aria-hidden="true" />
              <div><strong>Back-to-back hard sessions</strong><span>Two hard conditioning sessions are planned on consecutive days.</span></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isWeekSet ? (
        <section className="performance-card week-plan-card">
          <SectionHeading
            eyebrow="Current individual plan"
            title="Monday → Sunday"
            action={<Button size="sm" variant="outline" onClick={() => onNavigate("week", { weekAction: "add" })}><Plus aria-hidden="true" /> Add</Button>}
          />
          <AthleteToggle athletes={data.athletes} value={perspective} onChange={setPerspective} />
          <div className="day-card-stack">
            {athleteSessions.map((session) => (
              <article className={`day-session-card ${categoryMeta[session.category].className}`} key={session.id}>
                <div className="day-date-block">
                  <span>{formatDay(session.scheduledDate, { day: undefined, month: undefined })}</span>
                  <strong>{new Date(`${session.scheduledDate}T00:00:00Z`).getUTCDate()}</strong>
                </div>
                <div className="day-session-main">
                  <div className="day-session-title-row">
                    <div>
                      <h3>{session.title}</h3>
                      <p>{session.details}</p>
                    </div>
                    <CategoryBadge category={session.category} compact />
                  </div>
                  <div className="session-meta-row">
                    <span><Users aria-hidden="true" /> {session.assignment === "together" ? "Together" : "Individual"}</span>
                    <span className={`session-status session-status-${session.status}`}>{session.status}</span>
                    {session.status === "completed" && session.rpe ? <span>RPE {session.rpe}</span> : null}
                  </div>
                </div>
                {perspective === data.actor.id && session.status !== "completed" ? (
                  <button type="button" className="session-edit-button" onClick={() => openEditor(session)} aria-label={`Edit ${session.title}`}>
                    <Edit3 aria-hidden="true" />
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="performance-card recommended-plan-card">
          <SectionHeading eyebrow="Recommended this week" title="Default session preview" />
          <p className="supporting-copy">These sessions remain a recommendation until Thomas and KT set the shared week.</p>
          {allCompletedSessions.length ? (
            <div className="preserved-completions-panel">
              <CheckCircle2 aria-hidden="true" />
              <span><strong>{allCompletedSessions.length} completed {allCompletedSessions.length === 1 ? "session remains" : "sessions remain"} in history</strong><small>Completed results are separate from this new recommendation.</small></span>
            </div>
          ) : null}
          <div className="day-card-stack">
            {data.originalPlan.map((session) => (
              <article className={`day-session-card day-session-recommended ${categoryMeta[session.category].className}`} key={session.id}>
                <div className="day-date-block"><span>{formatDay(session.scheduledDate, { day: undefined, month: undefined })}</span><strong>{new Date(`${session.scheduledDate}T00:00:00Z`).getUTCDate()}</strong></div>
                <div className="day-session-main"><div className="day-session-title-row"><div><h3>{session.title}</h3><p>{session.details}</p></div><CategoryBadge category={session.category} compact /></div><div className="session-meta-row"><span><Clock3 aria-hidden="true" /> Recommended</span></div></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {isWeekSet ? <section className="performance-card">
        <SectionHeading eyebrow={weekEnded ? "Week complete" : "Live objectives"} title={weekEnded ? "Weekly report" : "Target progress"} />
        <TargetBars totals={totals} week={data.week} />
        {weekEnded ? (
          <div className="report-metrics">
            <div><strong>{results.length}</strong><span>sessions completed</span></div>
            <div><strong>{averageRpe}</strong><span>average RPE</span></div>
            <div><strong>{data.progress[perspective]?.filter((item) => item.recommendedLoadKg).length ?? 0}</strong><span>progressions ready</span></div>
          </div>
        ) : (
          <p className="target-footnote">Targets remain neutral while there is still time in the week. Completion is based on category, not the original date.</p>
        )}
      </section> : null}

      <section className="performance-card original-plan-card">
        <SectionHeading eyebrow="Plan history" title="Shared and current plans" />
        <div className="plan-history-tabs" role="tablist" aria-label="Plan history views">
          <button type="button" className={historyTab === "original" ? "active" : ""} onClick={() => setHistoryTab("original")}>Original shared</button>
          <button type="button" className={historyTab === "thomas" ? "active" : ""} onClick={() => setHistoryTab("thomas")}>Thomas</button>
          <button type="button" className={historyTab === "kt" ? "active" : ""} onClick={() => setHistoryTab("kt")}>KT</button>
          <button type="button" className={historyTab === "history" ? "active" : ""} onClick={() => setHistoryTab("history")}><History /> Changes</button>
        </div>
        {historyTab === "history" ? (
          <div className="plan-change-list">
            {data.planHistory.length ? data.planHistory.map((item) => (
              <div key={item.id}><span>{item.athleteName}</span><strong>{item.message}</strong><small>{item.undoneAt ? "Undone" : formatDay(item.createdAt.slice(0, 10))}</small></div>
            )) : <p className="picker-empty">Plan and target changes will appear here.</p>}
          </div>
        ) : (
          <div className="original-plan-list">
            {planDetailRows.map((session) => (
              <div key={session.id}><span>{formatDay(session.scheduledDate)}</span><strong>{session.title}</strong></div>
            ))}
          </div>
        )}
      </section>

      {selectedSession ? (
        <SessionEditor
          key={selectedSession.id}
          session={selectedSession}
          open={editorOpen}
          onOpenChange={(value) => {
            if (!value && route.weekAction === "edit") onBack();
          }}
          library={data.workoutLibrary}
          mutate={mutate}
        />
      ) : null}
      <AddSessionDialog data={data} open={addOpen} onOpenChange={(value) => {
        if (!value && route.weekAction === "add") onBack();
      }} mutate={mutate} />
      <Dialog open={targetEditOpen} onOpenChange={setTargetEditOpen}>
        <DialogContent className="training-dialog target-edit-dialog">
          <DialogHeader><DialogTitle>Edit weekly targets</DialogTitle><DialogDescription>Plan validation and completed progress will use these shared targets immediately.</DialogDescription></DialogHeader>
          <div className="stepper-grid">
            <TargetStepper label="Hard Conditioning" value={targets.hard} onChange={(hard) => setTargets((current) => ({ ...current, hard }))} />
            <TargetStepper label="Strength" value={targets.strength} onChange={(strength) => setTargets((current) => ({ ...current, strength }))} />
            <TargetStepper label="Easy Aerobic" value={targets.easy} onChange={(easy) => setTargets((current) => ({ ...current, easy }))} />
          </div>
          <DialogFooter><Button onClick={saveTargets}>Save targets</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={resetDialog === "me"} onOpenChange={(open) => !open && setResetDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset my plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores your future plan to the original shared week. Your partner’s current plan is unchanged.
              {myCompletedSessions.length ? ` ${myCompletedSessions.length} completed ${myCompletedSessions.length === 1 ? "session" : "sessions"} will remain exactly as logged.` : " Completed workout results and strength history are never deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => resetPlan("me")}>Reset my plan</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={resetDialog === "shared"} onOpenChange={(open) => !open && setResetDialog(null)}>
        <DialogContent className="training-dialog reset-choice-dialog">
          <DialogHeader><DialogTitle>Reset shared week</DialogTitle><DialogDescription>Choose how far you want to reset. Completed workouts and logged results are always preserved.</DialogDescription></DialogHeader>
          <div className="reset-choice-list">
            <div className="reset-choice"><Users aria-hidden="true" /><span><strong>Reset both plans</strong><small>Restore both current plans to the original shared week. The week remains set and targets stay agreed.</small><Button type="button" size="sm" onClick={() => resetPlan("both")} disabled={resettingScope !== null}>{resettingScope === "both" ? "Resetting…" : "Reset both plans"}</Button></span></div>
            <div className="reset-choice reset-choice-destructive"><RotateCcw aria-hidden="true" /><span><strong>Reset &amp; unset week</strong><small>Return this week to planning mode. Completed training remains stored.</small><Button type="button" size="sm" variant="destructive" onClick={() => { setResetDialog(null); setUnsetConfirmOpen(true); }}>Reset &amp; unset week</Button></span></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setResetDialog(null)}>Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={unsetConfirmOpen} onOpenChange={setUnsetConfirmOpen}>
        <AlertDialogContent className="unset-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset &amp; unset this week?</AlertDialogTitle>
            <AlertDialogDescription>
              The week will return to Not Set so Thomas and KT can use Plan this week again. Agreed targets and all future individual changes will be cleared.
              {allCompletedSessions.length
                ? ` ${allCompletedSessions.length} completed ${allCompletedSessions.length === 1 ? "session will" : "sessions will"} remain in training history; only the remaining plan and weekly planning state will reset.`
                : " No completed workout, strength, progression, event, activity or reaction history will be deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep week set</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={unsetWeek}>Reset &amp; unset week</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
