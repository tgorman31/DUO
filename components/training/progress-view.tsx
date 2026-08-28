"use client";

import { useState } from "react";
import { ArrowUpRight, BarChart3, Dumbbell, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AppData, AppRoute, MainView, Mutate, ProgressState } from "@/lib/app-types";
import { AthleteToggle, EmptyState, formatDay, SectionHeading } from "./common";

function formatProgressLoad(value: number, convention: ProgressState["loadConvention"]) {
  if (convention === "per_hand") return `${value} kg / hand`;
  if (convention === "machine_stack") return `${value} kg stack`;
  if (convention === "bodyweight_plus") return `BW + ${value} kg`;
  if (convention === "time") return `${value} sec`;
  if (convention === "distance") return `${value} m`;
  return `${value} kg`;
}

function ExerciseTrend({ state, onOpen }: { state: ProgressState; onOpen?: () => void }) {
  const history = [...state.history].reverse();
  const max = Math.max(state.currentLoadKg, ...history.map((item) => item.workingLoadKg), 1);
  return (
    <article className={onOpen ? "progress-exercise-card progress-exercise-card-action" : "progress-exercise-card"} onClick={onOpen}>
      <div className="progress-card-head">
        <div>
          <span>{state.exerciseName}</span>
          <strong>{formatProgressLoad(state.currentLoadKg, state.loadConvention)}</strong>
        </div>
        {state.recommendedLoadKg ? (
          <div className="progression-chip">
            <ArrowUpRight aria-hidden="true" />
            Try {formatProgressLoad(state.recommendedLoadKg, state.loadConvention)}
          </div>
        ) : (
          <div className="build-reps-chip">Build reps</div>
        )}
      </div>
      {history.length ? (
        <div className="micro-chart" role="img" aria-label={`${state.exerciseName} load history`}>
          {history.map((item) => (
            <div className="micro-bar-wrap" key={item.id}>
              <div className="micro-bar" style={{ height: `${Math.max(12, (item.workingLoadKg / max) * 100)}%` }} />
              <span>{item.workingLoadKg}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="progress-card-foot">
        <span>{history.length} logged {history.length === 1 ? "session" : "sessions"}</span>
        <span>Updated {formatDay(state.updatedAt.slice(0, 10))}</span>
      </div>
    </article>
  );
}

function ExerciseSettingsView({ state, mutate, onBack }: { state: ProgressState; mutate: Mutate; onBack: () => void }) {
  const [preferredName, setPreferredName] = useState(state.preferredName);
  const [loadConvention, setLoadConvention] = useState(state.loadConvention);
  const [increment, setIncrement] = useState(String(state.loadIncrementKg));
  const [approved, setApproved] = useState(state.approvedAlternativeIds);
  const [defaultAlternative, setDefaultAlternative] = useState(state.defaultAlternativeId ?? state.exerciseId);
  const [notes, setNotes] = useState(state.notes);
  const toggleAlternative = (id: string) => setApproved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const save = async () => {
    await mutate({ action: "updateExerciseSettings", exerciseId: state.exerciseId, preferredName, loadConvention, loadIncrementKg: increment, approvedAlternativeIds: approved, defaultAlternativeId: defaultAlternative, notes }, "Exercise settings saved");
    onBack();
  };
  return (
    <div className="view-stack">
      <section className="progress-hero"><div><p className="eyebrow">Exercise history & settings</p><h1>{state.exerciseName}</h1><p>Settings change future suggestions and labels without merging or rewriting progression history.</p></div><Dumbbell /></section>
      <section className="performance-card exercise-settings-form">
        <div className="field-stack"><Label htmlFor="preferred-exercise-name">Preferred exercise name</Label><Input id="preferred-exercise-name" value={preferredName} onChange={(event) => setPreferredName(event.target.value)} placeholder={state.exerciseName} /></div>
        <div className="two-field-grid"><div className="field-stack"><Label htmlFor="load-convention">Load convention</Label><Select value={loadConvention} onValueChange={(value) => setLoadConvention(value as ProgressState["loadConvention"])}><SelectTrigger id="load-convention" className="full-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="total_load">Total load</SelectItem><SelectItem value="per_hand">kg per hand</SelectItem><SelectItem value="machine_stack">Machine stack</SelectItem><SelectItem value="bodyweight_plus">Bodyweight + load</SelectItem><SelectItem value="single_load">Single dumbbell / load</SelectItem><SelectItem value="time">Time</SelectItem><SelectItem value="distance">Distance</SelectItem></SelectContent></Select></div><div className="field-stack"><Label htmlFor="exercise-increment">Load increment</Label><Input id="exercise-increment" type="number" inputMode="decimal" min="0" step="0.5" value={increment} onChange={(event) => setIncrement(event.target.value)} /></div></div>
        <div className="field-stack"><Label>Approved alternatives</Label><div className="alternative-check-list">{state.alternatives.filter((item) => item.id !== state.exerciseId).map((item) => <Label htmlFor={`alternative-${item.id}`} key={item.id}><Checkbox id={`alternative-${item.id}`} checked={approved.includes(item.id)} onCheckedChange={() => toggleAlternative(item.id)} /><span>{item.name}</span></Label>)}</div></div>
        <div className="field-stack"><Label htmlFor="default-alternative">Default alternative</Label><Select value={defaultAlternative} onValueChange={setDefaultAlternative}><SelectTrigger id="default-alternative" className="full-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={state.exerciseId}>{state.exerciseName}</SelectItem>{state.alternatives.filter((item) => approved.includes(item.id)).map((item) => <SelectItem value={item.id} key={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="field-stack"><Label htmlFor="exercise-settings-notes">Notes</Label><Textarea id="exercise-settings-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
        <Button onClick={save}>Save exercise settings</Button>
      </section>
      <section><SectionHeading eyebrow="Separate progression record" title="History" /><div className="exercise-history-list">{state.history.map((item) => <div key={item.id}><span>{formatDay(item.performedAt)}</span><strong>{formatProgressLoad(item.workingLoadKg, state.loadConvention)}</strong><small>{item.sets.map((set) => set.reps).join(" / ")} reps</small></div>)}</div></section>
    </div>
  );
}

export function ProgressView({ data, mutate, route, onNavigate, onBack }: { data: AppData; mutate: Mutate; route: AppRoute; onNavigate: (view: MainView, details?: Partial<AppRoute>, replace?: boolean) => void; onBack: () => void }) {
  const [athleteId, setAthleteId] = useState(data.actor.id);
  const progress = data.progress[athleteId] ?? [];
  const consistency = (data.consistency[athleteId] ?? []).filter(
    (week) => week.startDate <= data.serverDate,
  ).slice(-8);
  const pending = progress.filter((item) => item.recommendedLoadKg);
  const muscleRecency = (() => {
    const today = new Date(`${data.serverDate}T00:00:00Z`).getTime();
    const exposure = new Map<string, number>();
    for (const entry of data.exerciseHistory.filter((item) => item.athleteId === athleteId)) {
      const catalogue = data.v2.catalogue.find((exercise) => exercise.legacyExerciseId === entry.exerciseId || exercise.name.toLowerCase() === entry.exerciseName.toLowerCase());
      const muscles = catalogue ? [catalogue.primaryMuscleGroup, ...(catalogue.secondaryMuscleGroups ?? "").split(";").map((item) => item.trim())] : [];
      for (const muscle of muscles.filter(Boolean)) exposure.set(muscle, Math.max(exposure.get(muscle) ?? 0, new Date(`${entry.performedAt}T00:00:00Z`).getTime()));
    }
    const meaningful = ["Chest", "Hamstrings", "Calves", "Quads", "Glutes", "Back", "Shoulders", "Triceps", "Core", "Grip / Forearms"];
    return meaningful.map((muscle) => ({ muscle, days: exposure.has(muscle) ? Math.max(0, Math.round((today - (exposure.get(muscle) ?? today)) / 86_400_000)) : null })).sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999)).slice(0, 3);
  })();
  const selected = (data.progress[data.actor.id] ?? []).find((item) => item.exerciseId === route.exerciseId);
  if (selected) return <ExerciseSettingsView state={selected} mutate={mutate} onBack={onBack} />;

  return (
    <div className="view-stack">
      <section className="progress-hero">
        <div>
          <p className="eyebrow">Evidence over noise</p>
          <h1>Progress</h1>
          <p>Exercise-specific strength history and weekly objective consistency.</p>
        </div>
        <TrendingUp aria-hidden="true" />
      </section>

      <AthleteToggle athletes={data.athletes} value={athleteId} onChange={setAthleteId} />

      <section>
        <SectionHeading
          eyebrow="Double progression"
          title="Strength"
          action={pending.length ? <span className="pending-count">{pending.length} ready</span> : undefined}
        />
        {progress.length ? (
          <div className="progress-grid">
            {progress.map((state) => <ExerciseTrend state={state} onOpen={athleteId === data.actor.id ? () => onNavigate("progress", { exerciseId: state.exerciseId }) : undefined} key={state.exerciseId} />)}
          </div>
        ) : (
          <EmptyState
            title="No strength history yet"
            description="The first logged exercise will show “No previous session”. Loads, reps and future recommendations will then build here."
          />
        )}
      </section>

      <section className="performance-card consistency-card">
        <SectionHeading eyebrow="Objectives achieved" title="Training consistency" />
        {consistency.length ? (
          <>
            <div className="consistency-legend">
              <span><i className="legend-hard" /> Hard</span>
              <span><i className="legend-strength" /> Strength</span>
              <span><i className="legend-easy" /> Easy</span>
            </div>
            <div className="consistency-chart" role="img" aria-label="Weekly target completion history">
              {consistency.map((week) => {
                const achieved = [
                  week.targets.hard === 0 || week.completed.hard >= week.targets.hard,
                  week.targets.strength === 0 || week.completed.strength >= week.targets.strength,
                  week.targets.easy === 0 || week.completed.easy >= week.targets.easy,
                ];
                return (
                  <div className="consistency-week" key={week.weekId}>
                    <div className={achieved[0] ? "consistency-segment segment-hard achieved" : "consistency-segment segment-hard"} />
                    <div className={achieved[1] ? "consistency-segment segment-strength achieved" : "consistency-segment segment-strength"} />
                    <div className={achieved[2] ? "consistency-segment segment-easy achieved" : "consistency-segment segment-easy"} />
                    <span>{new Date(`${week.startDate}T00:00:00Z`).getUTCDate()}</span>
                  </div>
                );
              })}
            </div>
            <p className="target-footnote">A segment fills when that category target is achieved. Moving a workout does not break the week.</p>
          </>
        ) : (
          <div className="consistency-placeholder"><BarChart3 /><p>Consistency will populate as training weeks are completed.</p></div>
        )}
      </section>

      <section className="performance-card neglected-muscles-card">
        <SectionHeading eyebrow="Strength recency" title="Most neglected" />
        <div className="neglected-muscle-list">{muscleRecency.map((item) => <div key={item.muscle}><strong>{item.muscle}</strong><span>{item.days === null ? "No logged strength exposure" : `${item.days} day${item.days === 1 ? "" : "s"}`}</span></div>)}</div>
        <p className="target-footnote">Based on logged primary and meaningful secondary strength work. Incidental conditioning does not reset recency.</p>
      </section>

      <section className="progress-principles-grid">
        <article><Dumbbell /><div><strong>Exercise-specific</strong><p>Leg Curl and RDL keep completely separate histories.</p></div></article>
        <article><Target /><div><strong>Persistent recommendations</strong><p>An earned load increase remains until the athlete actually takes it.</p></div></article>
      </section>
    </div>
  );
}
