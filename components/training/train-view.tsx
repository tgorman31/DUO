"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Gauge,
  Minus,
  Moon,
  Plus,
  Sparkles,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
  ExerciseOption,
  LibraryItem,
  LoadConvention,
  MainView,
  Mutate,
  Session,
  StrengthSlot,
} from "@/lib/app-types";
import { CategoryBadge, EmptyState, formatDay, SectionHeading } from "./common";

type Navigate = (view: MainView, details?: Partial<AppRoute>, replace?: boolean) => void;
type SetDraft = { weightKg: string; reps: string };
type ExerciseDraft = {
  slotId: string;
  exerciseId: string;
  workingLoad: string;
  sets: SetDraft[];
  note: string;
};

function ScoreInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const number = value ? Number(value) : 0;
  return (
    <div className="score-input">
      <Label htmlFor={id}>{label}</Label>
      <div>
        <button type="button" onClick={() => onChange(String(Math.max(1, number - 1)))} aria-label={`Decrease ${label}`}><Minus aria-hidden="true" /></button>
        <Input id={id} placeholder="—" type="number" inputMode="numeric" min="1" max="10" value={value} onChange={(event) => onChange(event.target.value)} />
        <button type="button" onClick={() => onChange(String(Math.min(10, number + 1 || 1)))} aria-label={`Increase ${label}`}><Plus aria-hidden="true" /></button>
      </div>
      <small>1 low · 10 high</small>
    </div>
  );
}

function Prescription({ workout, fallback }: { workout: LibraryItem | null; fallback: string }) {
  if (!workout) {
    return (
      <section className="prescription-card prescription-card-simple">
        <p className="eyebrow">Workout prescription</p>
        <h2>Session overview</h2>
        <p>{fallback || "Follow the planned session objective and keep the effort appropriate for the week."}</p>
      </section>
    );
  }
  const sections = [
    ["Purpose", workout.purpose],
    ["Warm-up", workout.warmUp],
    ["Main set", workout.mainSet],
    ["Recovery", workout.recovery],
    ["Intensity", workout.intensityGuidance],
    ["Cool-down", workout.coolDown],
    ["Equipment", workout.equipment],
    ["Coaching notes", workout.notes],
  ].filter(([, value]) => value);
  return (
    <section className="prescription-card">
      <div className="prescription-heading">
        <div><p className="eyebrow">Workout prescription</p><h2>{workout.name}</h2></div>
        {workout.estimatedDuration ? <span><Timer aria-hidden="true" /> {workout.estimatedDuration}</span> : null}
      </div>
      <div className="prescription-grid">
        {sections.map(([label, value]) => (
          <div className={label === "Main set" ? "prescription-section prescription-main-set" : "prescription-section"} key={label}>
            <span>{label}</span><p>{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PreviousResult({ session, data }: { session: Session; data: AppData }) {
  const last = data.recentSessions.find(
    (item) => item.athleteId === data.actor.id && item.id !== session.id && (session.workoutTemplateId ? item.workoutTemplateId === session.workoutTemplateId : item.title === session.title),
  );
  if (!last) return null;
  const result = [
    last.averagePace ? `Avg pace ${last.averagePace}/km` : "",
    last.totalTime ? `Time ${last.totalTime}` : "",
    last.distance !== null ? `${last.distance} km` : "",
    last.rounds !== null ? `${last.rounds} rounds` : "",
    last.reps !== null ? `${last.reps} reps` : "",
    last.calories !== null ? `${last.calories} cal` : "",
    last.customValue !== null ? String(last.customValue) : "",
    last.rpe ? `RPE ${last.rpe}` : "",
    last.feel ? `Feel ${last.feel}` : "",
  ].filter(Boolean);
  return <div className="last-time-card"><span>Last time</span><strong>{result.join(" · ") || "Completed"}</strong></div>;
}

function PrimaryResultInput({ workout, values, update }: { workout: LibraryItem | null; values: Record<string, string>; update: (key: string, value: string) => void }) {
  const type = workout?.resultType ?? "completion";
  if (type === "completion") return null;
  const config: Record<string, { label: string; key: string; placeholder: string; suffix?: string; step?: string }> = {
    average_pace: { label: "Average rep pace", key: "averagePace", placeholder: "--:--", suffix: "/ km" },
    total_time: { label: "Total time", key: "totalTime", placeholder: "hh:mm:ss" },
    distance: { label: "Distance", key: "distance", placeholder: "—", suffix: "km", step: "0.01" },
    rounds: { label: "Rounds", key: "rounds", placeholder: "—", step: "0.1" },
    reps: { label: "Reps", key: "reps", placeholder: "—", step: "1" },
    calories: { label: "Calories", key: "calories", placeholder: "—", step: "1" },
    custom_numeric: { label: workout?.customResultLabel || "Result", key: "customValue", placeholder: "—", step: "0.1" },
  };
  const item = config[type];
  if (!item) return null;
  const textInput = type === "average_pace" || type === "total_time";
  return (
    <div className="field-stack pace-field">
      <Label htmlFor={`result-${item.key}`}>{item.label}</Label>
      <div>
        <Input id={`result-${item.key}`} type={textInput ? "text" : "number"} inputMode={textInput ? "numeric" : "decimal"} step={item.step} placeholder={item.placeholder} value={values[item.key] ?? ""} onChange={(event) => update(item.key, event.target.value)} />
        {item.suffix ? <span>{item.suffix}</span> : null}
      </div>
    </div>
  );
}

function WorkoutLogger({ session, data, mutate, onDone }: { session: Session; data: AppData; mutate: Mutate; onDone: () => void }) {
  const draftKey = `duo-engine:draft:${data.actor.id}:${session.id}:workout`;
  const [completedDate, setCompletedDate] = useState(session.scheduledDate);
  const [rpe, setRpe] = useState("");
  const [feel, setFeel] = useState("");
  const [notes, setNotes] = useState("");
  const [results, setResults] = useState<Record<string, string>>({ averagePace: "", totalTime: "", distance: "", rounds: "", reps: "", calories: "", customValue: "" });
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved) as { completedDate?: string; rpe?: string; feel?: string; notes?: string; results?: Record<string, string> };
        if (draft.completedDate) setCompletedDate(draft.completedDate);
        setRpe(draft.rpe ?? ""); setFeel(draft.feel ?? ""); setNotes(draft.notes ?? "");
        if (draft.results) setResults((current) => ({ ...current, ...draft.results }));
      }
    } finally { setDraftReady(true); }
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady) return;
    window.localStorage.setItem(draftKey, JSON.stringify({ completedDate, rpe, feel, notes, results }));
  }, [completedDate, draftKey, draftReady, feel, notes, results, rpe]);

  const complete = async () => {
    await mutate({ action: "completeWorkout", sessionId: session.id, completedDate, rpe, feel, notes, ...results }, `${session.title} completed`);
    window.localStorage.removeItem(draftKey); onDone();
  };

  return (
    <section className="logger-shell cardio-logger">
      <div className="logger-header"><div><p className="eyebrow">Log your own result</p><h2>{session.title}</h2><p>Today’s fields start blank. Previous results stay separate below.</p></div><CategoryBadge category={session.category} /></div>
      <PreviousResult session={session} data={data} />
      <div className="field-stack"><Label htmlFor="completed-date">Completed date</Label><Input id="completed-date" type="date" value={completedDate} onChange={(event) => setCompletedDate(event.target.value)} /></div>
      <PrimaryResultInput workout={session.workout} values={results} update={(key, value) => setResults((current) => ({ ...current, [key]: value }))} />
      <div className="score-grid"><ScoreInput id="workout-rpe" label="Session RPE" value={rpe} onChange={setRpe} /><ScoreInput id="workout-feel" label="How did it feel?" value={feel} onChange={setFeel} /></div>
      <div className="field-stack"><Label htmlFor="workout-notes">Session notes <span className="optional-label">Optional</span></Label><Textarea id="workout-notes" placeholder="Anything useful for next time?" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
      <div className="logger-sticky-actions"><Button className="complete-workout-button" onClick={complete} disabled={!rpe || !feel}><Check aria-hidden="true" /> Complete workout</Button></div>
    </section>
  );
}

function roundTo(value: number, increment: number) { return increment ? Math.round(value / increment) * increment : Math.round(value * 10) / 10; }

function warmupsFor(weight: number, option: ExerciseOption) {
  if (!weight || weight <= 0 || option.defaultIncrementKg === 0) return [];
  const increment = Math.max(0.5, option.defaultIncrementKg || 2.5);
  if (option.isAccessory) return [{ weight: roundTo(weight * 0.6, increment), reps: 8 }].filter((item) => item.weight < weight);
  return [{ weight: roundTo(weight * 0.55, increment), reps: 8 }, { weight: roundTo(weight * 0.72, increment), reps: 6 }, { weight: roundTo(weight * 0.87, increment), reps: 3 }].filter((item, index, list) => item.weight > 0 && item.weight < weight && list.findIndex((other) => other.weight === item.weight) === index);
}

function loadSuffix(convention: LoadConvention) {
  if (convention === "per_hand") return "kg / hand";
  if (convention === "machine_stack") return "kg stack";
  if (convention === "bodyweight_plus") return "kg added";
  if (convention === "time") return "sec";
  if (convention === "distance") return "m";
  return "kg";
}

function formatLoad(value: number, convention: LoadConvention) {
  if (convention === "per_hand") return `${value} kg / hand`;
  if (convention === "machine_stack") return `${value} kg stack`;
  if (convention === "bodyweight_plus") return `Bodyweight + ${value} kg`;
  if (convention === "time") return `${value} sec`;
  if (convention === "distance") return `${value} m`;
  return `${value} kg`;
}

function createExerciseDraft(data: AppData, slot: StrengthSlot, exerciseId = slot.selectedExerciseId): ExerciseDraft {
  const previous = data.exerciseHistory.find((entry) => entry.athleteId === data.actor.id && entry.exerciseId === exerciseId);
  const state = data.progress[data.actor.id]?.find((item) => item.exerciseId === exerciseId);
  const load = state?.currentLoadKg ?? previous?.workingLoadKg;
  return { slotId: slot.id, exerciseId, workingLoad: load ? String(load) : "", sets: Array.from({ length: slot.workingSets }, () => ({ weightKg: load ? String(load) : "", reps: "" })), note: "" };
}

function StrengthLogger({ data, session, route, mutate, onNavigate, onDone }: { data: AppData; session: Session; route: AppRoute; mutate: Mutate; onNavigate: Navigate; onDone: () => void }) {
  const definition = data.strengthDefinitions.find((item) => item.workoutKind === session.workoutKind) ?? (() => {
    const template = session.workout?.strengthTemplateId
      ? data.v2.strengthTemplates.find((item) => item.id === session.workout?.strengthTemplateId)
      : null;
    if (!template) return undefined;
    return {
      workoutKind: session.workoutKind,
      label: session.workout?.name ?? template.name,
      slots: template.slots.map((slot) => {
        const focus = data.v2.trainingFocuses.find((item) => item.id === slot.focusId);
        const options = data.v2.catalogue
          .filter((exercise) => exercise.trainingFocus === focus?.name)
          .sort((a, b) => a.focusRank - b.focusRank)
          .map((exercise) => ({
            slotId: slot.id,
            exerciseId: exercise.id,
            name: exercise.name,
            baseName: exercise.name,
            trainingGoal: focus?.name ?? "Training focus",
            defaultIncrementKg: exercise.defaultIncrementKg ?? data.actor.loadIncrementKg,
            loadConvention: exercise.loadConvention as LoadConvention,
            isAccessory: /accessory|curl|raise|calf|plank/i.test(focus?.name ?? ""),
            hyroxCarryover: exercise.helpsWith,
          }));
        const selected = slot.exerciseId ?? options[0]?.exerciseId ?? "";
        const prescription = slot.prescription || focus?.defaultPrescription || "3 × 8–10";
        const numbers = prescription.match(/(\d+)\s*[×x]\s*(\d+)(?:\s*[–-]\s*(\d+))?/i);
        return {
          id: slot.id,
          workoutKind: session.workoutKind,
          sortOrder: slot.sortOrder,
          trainingGoal: focus?.name ?? "Training focus",
          defaultExerciseId: selected,
          workingSets: numbers ? Number(numbers[1]) : 3,
          repLow: numbers ? Number(numbers[2]) : 8,
          repHigh: numbers ? Number(numbers[3] ?? numbers[2]) : 10,
          selectedExerciseId: selected,
          options,
        };
      }),
    };
  })();
  const initialIndex = Math.max(0, definition?.slots.findIndex((slot) => slot.id === route.exerciseId) ?? 0);
  const [index, setIndex] = useState(initialIndex);
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraft>>(() => Object.fromEntries((definition?.slots ?? []).map((slot) => [slot.id, createExerciseDraft(data, slot)])));
  const [rpe, setRpe] = useState(""); const [feel, setFeel] = useState(""); const [sessionNotes, setSessionNotes] = useState("");
  const [completedDate, setCompletedDate] = useState(session.scheduledDate); const [draftReady, setDraftReady] = useState(false);
  const draftKey = `duo-engine:draft:${data.actor.id}:${session.id}:strength`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved) as { drafts?: Record<string, ExerciseDraft>; rpe?: string; feel?: string; sessionNotes?: string; completedDate?: string };
        if (draft.drafts) setDrafts(draft.drafts); setRpe(draft.rpe ?? ""); setFeel(draft.feel ?? ""); setSessionNotes(draft.sessionNotes ?? ""); if (draft.completedDate) setCompletedDate(draft.completedDate);
      }
    } finally { setDraftReady(true); }
  }, [draftKey]);
  useEffect(() => { if (draftReady) window.localStorage.setItem(draftKey, JSON.stringify({ drafts, rpe, feel, sessionNotes, completedDate })); }, [completedDate, draftKey, draftReady, drafts, feel, rpe, sessionNotes]);

  if (!definition) return <EmptyState title="Strength template unavailable" description="This session is not linked to Strength A or Strength B." />;
  const slot = definition.slots[index]; const draft = drafts[slot.id] ?? createExerciseDraft(data, slot);
  const option = slot.options.find((item) => item.exerciseId === draft.exerciseId) ?? slot.options[0]; const convention = option?.loadConvention ?? "total_load";
  const previous = data.exerciseHistory.find((entry) => entry.athleteId === data.actor.id && entry.exerciseId === draft.exerciseId);
  const progression = data.progress[data.actor.id]?.find((item) => item.exerciseId === draft.exerciseId);
  const workingWeight = Number(draft.workingLoad || 0); const warmups = option ? warmupsFor(workingWeight, option) : [];
  const updateDraft = (updates: Partial<ExerciseDraft>) => setDrafts((current) => ({ ...current, [slot.id]: { ...draft, ...updates } }));
  const updateWorkingLoad = (value: string) => updateDraft({ workingLoad: value, sets: draft.sets.map((set) => ({ ...set, weightKg: value })) });
  const changeExercise = (exerciseId: string) => updateDraft(createExerciseDraft(data, slot, exerciseId));
  const updateSet = (setIndex: number, key: keyof SetDraft, value: string) => updateDraft({ sets: draft.sets.map((set, itemIndex) => itemIndex === setIndex ? { ...set, [key]: value } : set) });
  const moveTo = (nextIndex: number) => { const bounded = Math.max(0, Math.min(definition.slots.length - 1, nextIndex)); setIndex(bounded); onNavigate("train", { sessionId: session.id, mode: "log", exerciseId: definition.slots[bounded].id }, true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const complete = async () => {
    const entries = definition.slots.map((item) => drafts[item.id]).filter(Boolean).map((item) => ({ slotId: item.slotId, exerciseId: item.exerciseId, note: item.note, sets: item.sets.filter((set) => Number(set.reps) > 0).map((set) => ({ weightKg: Number(set.weightKg || 0), reps: Number(set.reps) })) })).filter((entry) => entry.sets.length > 0);
    await mutate({ action: "completeStrength", sessionId: session.id, completedDate, rpe, feel, notes: sessionNotes, exercises: entries }, `${definition.label} completed and progression updated`);
    window.localStorage.removeItem(draftKey); onDone();
  };

  return (
    <section className="logger-shell strength-logger">
      <div className="strength-progress-head"><div><p className="eyebrow">{definition.label}</p><h2>Exercise {index + 1} of {definition.slots.length}</h2></div><Dumbbell aria-hidden="true" /></div>
      <Progress value={((index + 1) / definition.slots.length) * 100} className="exercise-progress" />
      <div className="exercise-panel">
        <aside className="exercise-context-panel" aria-label="Exercise context">
          <h3>Exercise context</h3>
          <div className="exercise-goal-row"><div><span>Training goal</span><strong>{slot.trainingGoal}</strong>{option?.hyroxCarryover?.length ? <div className="hyrox-carryover"><span>Helps with</span><div>{option.hyroxCarryover.map((item) => <span key={item}>{item}</span>)}</div></div> : null}</div><div className="exercise-prescription"><span>Prescription</span><strong>{slot.workingSets} × {slot.repLow}–{slot.repHigh}</strong></div></div>
        </aside>
        <div className="exercise-main-column">
          <div className="field-stack"><Label htmlFor="exercise-choice">Exercise</Label><Select value={draft.exerciseId} onValueChange={changeExercise}><SelectTrigger id="exercise-choice" className="full-select exercise-select"><SelectValue /></SelectTrigger><SelectContent>{slot.options.map((item) => <SelectItem value={item.exerciseId} key={item.exerciseId}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="history-recommendation-grid">
            <div className="history-box"><span>Previous result</span>{previous ? <><strong>{formatLoad(previous.workingLoadKg, convention)}</strong><small>{previous.sets.map((set) => set.reps).join(" / ")} reps · {formatDay(previous.performedAt)}</small></> : <><strong>No previous session</strong><small>Choose today’s intended working load.</small></>}</div>
            <div className={`recommendation-box ${progression?.recommendedLoadKg ? "recommendation-ready" : ""}`}><span>{progression?.recommendedLoadKg ? "Progression available" : "Recommended load"}</span><strong>{progression?.recommendedLoadKg ? formatLoad(progression.recommendedLoadKg, convention) : progression?.currentLoadKg ? formatLoad(progression.currentLoadKg, convention) : "—"}</strong><small>{progression?.recommendedLoadKg ? "Persists until you take the load." : "Build reps across the range."}</small></div>
          </div>
          <div className="working-load-control"><Label htmlFor="working-load">Today’s working load</Label><div><button type="button" onClick={() => updateWorkingLoad(String(Math.max(0, workingWeight - Math.max(0.5, option?.defaultIncrementKg || 2.5))))} aria-label="Decrease working load"><Minus /></button><Input id="working-load" type="number" inputMode="decimal" min="0" step={option?.defaultIncrementKg || 2.5} value={draft.workingLoad} onChange={(event) => updateWorkingLoad(event.target.value)} placeholder="—" /><span>{loadSuffix(convention)}</span><button type="button" onClick={() => updateWorkingLoad(String(workingWeight + Math.max(0.5, option?.defaultIncrementKg || 2.5)))} aria-label="Increase working load"><Plus /></button></div></div>
          <div className="warmup-box"><div><Sparkles aria-hidden="true" /><span><strong>Suggested warm-up</strong><small>Shown, not logged</small></span></div>{workingWeight > 0 ? warmups.length ? <p>{warmups.map((item) => `${formatLoad(item.weight, convention)} × ${item.reps}`).join(" · ")}</p> : <p>No separate ramp-up needed for this exercise.</p> : <p>Enter a working load to calculate ramp-up sets.</p>}</div>
          <div className="working-sets"><div className="set-table-head"><span>SET</span><span>{loadSuffix(convention)}</span><span>REPS</span></div>{draft.sets.map((set, setIndex) => <div className="set-row" key={setIndex}><strong>{setIndex + 1}</strong><Input aria-label={`Set ${setIndex + 1} ${loadSuffix(convention)}`} type="number" inputMode="decimal" value={set.weightKg} onChange={(event) => updateSet(setIndex, "weightKg", event.target.value)} /><Input aria-label={`Set ${setIndex + 1} reps`} type="number" inputMode="numeric" min="0" value={set.reps} onChange={(event) => updateSet(setIndex, "reps", event.target.value)} /></div>)}</div>
          <div className="field-stack"><Label htmlFor="exercise-note">Exercise note <span className="optional-label">Optional</span></Label><Input id="exercise-note" value={draft.note} onChange={(event) => updateDraft({ note: event.target.value })} placeholder="Form cue or useful context" /></div>
        </div>
      </div>
      <div className="exercise-navigation logger-sticky-actions"><Button variant="outline" onClick={() => moveTo(index - 1)} disabled={index === 0}><ChevronLeft /> Previous</Button>{index < definition.slots.length - 1 ? <Button onClick={() => moveTo(index + 1)}>Next exercise <ChevronRight /></Button> : null}</div>
      {index === definition.slots.length - 1 ? <div className="strength-finish-panel"><SectionHeading eyebrow="Finish workout" title="Your session result" /><div className="field-stack"><Label htmlFor="strength-date">Completed date</Label><Input id="strength-date" type="date" value={completedDate} onChange={(event) => setCompletedDate(event.target.value)} /></div><div className="score-grid"><ScoreInput id="strength-rpe" label="Session RPE" value={rpe} onChange={setRpe} /><ScoreInput id="strength-feel" label="How did it feel?" value={feel} onChange={setFeel} /></div><div className="field-stack"><Label htmlFor="strength-notes">Session notes <span className="optional-label">Optional</span></Label><Textarea id="strength-notes" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} /></div><div className="logger-sticky-actions"><Button className="complete-workout-button" onClick={complete} disabled={!rpe || !feel}><Check /> Complete {definition.label}</Button></div></div> : null}
    </section>
  );
}

export function TrainView({ data, mutate, route, onNavigate }: { data: AppData; mutate: Mutate; route: AppRoute; onNavigate: Navigate }) {
  const sessions = useMemo(() => data.sessions.filter((session) => session.athleteId === data.actor.id && session.status !== "removed").sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.sortOrder - b.sortOrder), [data]);
  const actualSessions = sessions.filter((session) => session.category !== "recovery");
  const todayRest = sessions.find((session) => session.scheduledDate === data.serverDate && session.category === "recovery" && session.status === "planned");
  const defaultSession = actualSessions.find((session) => session.status === "planned" && session.scheduledDate >= data.serverDate) ?? actualSessions.find((session) => session.status === "planned") ?? actualSessions[0];
  const selected = actualSessions.find((session) => session.id === route.sessionId) ?? defaultSession;

  if (!data.week.confirmedAt) {
    return (
      <div className="view-stack">
        <section className="train-hero week-unset-train-card">
          <div className="train-hero-icon"><ClipboardList aria-hidden="true" /></div>
          <p className="eyebrow">Recommended · not set</p>
          <h1>{data.week.title}</h1>
          <p>{data.week.rationale} Agree the shared week before the training queue becomes active.</p>
          <Button className="start-session-button" onClick={() => onNavigate("week")}>Plan this week <ArrowRight /></Button>
        </section>
        <EmptyState title="No active training queue" description="The training-block recommendation is waiting in Week. Completed sessions remain safely in history." />
      </div>
    );
  }

  if (route.mode === "log" && selected) {
    const structuredStrength = selected.workoutKind === "strength-a" || selected.workoutKind === "strength-b" || selected.workout?.family.toLowerCase() === "strength";
    return <div className="view-stack">{structuredStrength ? <StrengthLogger key={selected.id} data={data} session={selected} route={route} mutate={mutate} onNavigate={onNavigate} onDone={() => onNavigate("train", { sessionId: selected.id }, true)} /> : <><Prescription workout={selected.workout} fallback={selected.details} /><WorkoutLogger session={selected} data={data} mutate={mutate} onDone={() => onNavigate("train", { sessionId: selected.id }, true)} /></>}</div>;
  }
  if (!selected) return <div className="view-stack">{todayRest ? <section className="rest-status-card"><Moon /><div><p className="eyebrow">Today</p><h1>Rest / Recovery</h1><p>No structured training planned today.</p></div></section> : null}<EmptyState title="No workout planned" description="Add a session in Week, then return here to train." action={<Button onClick={() => onNavigate("week")}>Add training</Button>} /></div>;

  const upcoming = actualSessions.filter((session) => session.status === "planned");
  const coverage = selected.workout
    ? data.v2.catalogue.find((exercise) => exercise.name.toLowerCase() === selected.workout?.name.toLowerCase())?.helpsWith ?? []
    : [];
  const priorityStations = new Set((data.v2.priorities[data.actor.id] ?? []).slice(0, 3));
  return (
    <div className="view-stack">
      {todayRest ? <section className="rest-status-card"><Moon aria-hidden="true" /><div><p className="eyebrow">Today</p><h2>Rest / Recovery</h2><p>No structured training planned today.</p><span>Next training: {formatDay(selected.scheduledDate)} — {selected.title}</span></div><Button variant="outline" size="sm" onClick={() => mutate({ action: "markRestComplete", sessionId: todayRest.id }, "Recovery day marked complete")}>Mark day complete</Button></section> : null}
      <section className="train-hero train-overview-hero"><div className="train-hero-icon"><Gauge aria-hidden="true" /></div><p className="eyebrow">Workout overview</p><h1>{selected.title}</h1><p>{selected.workout?.purpose || selected.details}</p><div className="train-hero-meta"><CategoryBadge category={selected.category} /><span><Timer aria-hidden="true" /> {formatDay(selected.scheduledDate)}</span></div></section>
      <section className="performance-card session-location-card"><div className="field-stack"><Label htmlFor="session-location">Session location override <span className="optional-label">Optional</span></Label><Select value={selected.locationId ?? "default"} onValueChange={(value) => void mutate({ action: "setSessionLocation", sessionId: selected.id, locationId: value === "default" ? "" : value }, "Session location updated")}><SelectTrigger id="session-location" className="full-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Use current location ({data.v2.locations.find((location) => location.id === data.v2.currentLocationId)?.name ?? "none selected"})</SelectItem>{data.v2.locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></div></section>
      {selected.status === "completed" ? <div className="completed-banner"><Check /> Completed · RPE {selected.rpe ?? "—"}</div> : <section className="workout-start-actions"><Button className="start-session-button" onClick={() => onNavigate("train", { sessionId: selected.id, mode: "log" })}>Open workout <ArrowRight /></Button></section>}
      {coverage.length ? <section className="performance-card hyrox-coverage-card"><SectionHeading eyebrow="Informational context" title="HYROX areas hit" /><div className="coverage-chip-list">{coverage.map((station) => <span key={station}>{station}{priorityStations.has(station) ? <strong> · {data.actor.displayName.slice(0, 2).toUpperCase()} priority</strong> : null}</span>)}</div><small>Supporting strength is not the same as direct station practice.</small></section> : null}
      <section className="performance-card training-queue-card"><SectionHeading eyebrow="Your individual plan" title="Training queue" /><Select value={selected.id} onValueChange={(value) => onNavigate("train", { sessionId: value, mode: "log" })}><SelectTrigger className="full-select queue-select"><SelectValue /></SelectTrigger><SelectContent>{actualSessions.map((session) => <SelectItem value={session.id} key={session.id}>{formatDay(session.scheduledDate)} · {session.title}{session.status === "completed" ? " ✓" : ""}</SelectItem>)}</SelectContent></Select><div className="queue-list">{upcoming.slice(0, 4).map((session, queueIndex) => <button className={session.id === selected.id ? "queue-item queue-item-active" : "queue-item"} type="button" key={session.id} onClick={() => onNavigate("train", { sessionId: session.id, mode: "log" })}><span>{queueIndex + 1}</span><div><strong>{session.title}</strong><small>{formatDay(session.scheduledDate)} · {session.assignment === "together" ? "Together" : "Individual"}</small></div><ChevronRight aria-hidden="true" /></button>)}</div></section>
      <section className="training-principle-card"><Dumbbell aria-hidden="true" /><div><strong>Train the objective, not the calendar</strong><p>If this session no longer fits, move or replace it in Week. Weekly plan validation will recalculate immediately.</p></div></section>
    </div>
  );
}
