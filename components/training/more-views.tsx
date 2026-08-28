"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CalendarCheck,
  CalendarPlus,
  ChevronRight,
  CircleHelp,
  Copy,
  Dumbbell,
  Edit3,
  Flag,
  Layers3,
  LockKeyhole,
  MapPin,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  Trophy,
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
import { Checkbox } from "@/components/ui/checkbox";
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
  LibraryItem,
  MainView,
  Mutate,
  TrainingEvent,
} from "@/lib/app-types";
import { CategoryBadge, formatDay, SectionHeading } from "./common";

const stations = [
  "SkiErg",
  "Sled Push",
  "Sled Pull",
  "Burpee Broad Jumps",
  "Row",
  "Farmer Carry",
  "Sandbag Lunges",
  "Wall Balls",
];

function RaceReviewDialog({
  event,
  data,
  open,
  onOpenChange,
  mutate,
}: {
  event: TrainingEvent;
  data: AppData;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  mutate: Mutate;
}) {
  const shared = data.raceReviews.find((review) => review.eventId === event.id && review.athleteKey === "team");
  const personal = data.raceReviews.find((review) => review.eventId === event.id && review.athleteKey === data.actor.athleteKey);
  const [overallTime, setOverallTime] = useState(shared?.overallTime ?? "");
  const [averageRunPace, setAverageRunPace] = useState(shared?.averageRunPace ?? "");
  const [transitionTime, setTransitionTime] = useState(shared?.transitionTime ?? "");
  const [stationTimes, setStationTimes] = useState<Record<string, string>>(shared?.stationTimes ?? {});
  const [reflection, setReflection] = useState<Record<string, string>>(shared?.reflection ?? {});
  const [sharedNotes, setSharedNotes] = useState(shared?.notes ?? "");
  const [rpe, setRpe] = useState(personal?.rpe ? String(personal.rpe) : "8");
  const [feel, setFeel] = useState(personal?.feel ? String(personal.feel) : "7");
  const [personalNotes, setPersonalNotes] = useState(personal?.notes ?? "");
  const prompts = [
    ["wentWell", "What went well?"],
    ["strongest", "Strongest station"],
    ["weakest", "Weakest station"],
    ["paceDrop", "Where did running pace drop?"],
    ["limits", "Did grip, legs or shoulders become limiting?"],
    ["transitions", "Were transitions efficient?"],
    ["splits", "Did station splitting work?"],
    ["nextRace", "What should we change next race?"],
  ];

  const save = async () => {
    await mutate(
      {
        action: "saveRaceReview",
        eventId: event.id,
        overallTime,
        averageRunPace,
        transitionTime,
        stationTimes,
        reflection,
        sharedNotes,
        rpe,
        feel,
        personalNotes,
      },
      `${event.name} review saved`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="training-dialog race-review-dialog" mode="responsive-editor">
        <DialogHeader>
          <DialogTitle>{event.name} race review</DialogTitle>
          <DialogDescription>Shared doubles analysis plus {data.actor.displayName}’s private reflection.</DialogDescription>
        </DialogHeader>
        <div className="race-review-form">
          <h3>Core results</h3>
          <div className="three-field-grid">
            <div className="field-stack"><Label htmlFor="finish-time">Finish time</Label><Input id="finish-time" placeholder="1:20:00" value={overallTime} onChange={(event) => setOverallTime(event.target.value)} /></div>
            <div className="field-stack"><Label htmlFor="run-pace">Avg run pace</Label><Input id="run-pace" placeholder="4:55/km" value={averageRunPace} onChange={(event) => setAverageRunPace(event.target.value)} /></div>
            <div className="field-stack"><Label htmlFor="roxzone">Roxzone</Label><Input id="roxzone" placeholder="08:30" value={transitionTime} onChange={(event) => setTransitionTime(event.target.value)} /></div>
          </div>
          <details className="review-details">
            <summary>Optional station times</summary>
            <div className="station-time-grid">
              {stations.map((station) => (
                <div className="field-stack" key={station}><Label htmlFor={`station-${station}`}>{station}</Label><Input id={`station-${station}`} placeholder="mm:ss" value={stationTimes[station] ?? ""} onChange={(input) => setStationTimes((current) => ({ ...current, [station]: input.target.value }))} /></div>
              ))}
            </div>
          </details>
          <h3>Shared reflection</h3>
          <div className="reflection-grid">
            {prompts.map(([key, label]) => (
              <div className="field-stack" key={key}><Label htmlFor={`reflection-${key}`}>{label}</Label><Textarea id={`reflection-${key}`} value={reflection[key] ?? ""} onChange={(input) => setReflection((current) => ({ ...current, [key]: input.target.value }))} /></div>
            ))}
          </div>
          <div className="field-stack"><Label htmlFor="shared-notes">Shared doubles notes</Label><Textarea id="shared-notes" placeholder="Station split strategy, communication, transitions and pacing" value={sharedNotes} onChange={(event) => setSharedNotes(event.target.value)} /></div>
          <h3>{data.actor.displayName}’s reflection</h3>
          <div className="two-field-grid">
            <div className="field-stack"><Label htmlFor="review-rpe">RPE</Label><Input id="review-rpe" type="number" min="1" max="10" inputMode="numeric" value={rpe} onChange={(event) => setRpe(event.target.value)} /></div>
            <div className="field-stack"><Label htmlFor="review-feel">Feel</Label><Input id="review-feel" type="number" min="1" max="10" inputMode="numeric" value={feel} onChange={(event) => setFeel(event.target.value)} /></div>
          </div>
          <div className="field-stack"><Label htmlFor="personal-notes">Personal notes</Label><Textarea id="personal-notes" value={personalNotes} onChange={(event) => setPersonalNotes(event.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Save race review</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EventsView({
  data,
  mutate,
  route,
  onNavigate,
  onBack,
}: {
  data: AppData;
  mutate: Mutate;
  route: AppRoute;
  onNavigate: (view: MainView, details?: Partial<AppRoute>, replace?: boolean) => void;
  onBack: () => void;
}) {
  const reviewEvent = data.events.find((event) => event.id === route.eventId) ?? null;
  return (
    <div className="view-stack">
      <section className="more-hero events-hero"><Flag /><div><p className="eyebrow">{data.block.name}</p><h1>Events & race reviews</h1><p>Every race remains attached to its training block and post-race learning.</p></div></section>
      <section className="events-block-banner"><span>Training block</span><strong>{data.block.name}</strong><small>{formatDay(data.block.startDate, { weekday: undefined })} → {formatDay(data.block.endDate, { weekday: undefined })}</small></section>
      <section className="block-timeline-card">
        {data.phases.map((phase, index) => (
          <div className={data.phase?.id === phase.id ? "phase-node phase-node-current" : "phase-node"} key={phase.id}>
            <i>{index + 1}</i><div><strong>{phase.name}</strong><span>{formatDay(phase.startDate, { weekday: undefined })} → {formatDay(phase.endDate, { weekday: undefined })}</span><p>{phase.focus}</p></div>
          </div>
        ))}
      </section>
      <section>
        <SectionHeading eyebrow="Milestones" title="Block events" />
        <div className="event-list">
          {data.events.map((event) => {
            const reviewReady = event.daysAway <= 0 || event.status === "completed";
            const hasReview = data.raceReviews.some((review) => review.eventId === event.id);
            return (
              <article className={event.id === "event-hyrox-dublin-2026" ? "event-card event-card-dublin" : "event-card"} key={event.id}>
                <div className="event-date-tile"><span>{new Intl.DateTimeFormat("en-IE", { timeZone: "UTC", month: "short" }).format(new Date(`${event.eventDate}T00:00:00Z`))}</span><strong>{new Date(`${event.eventDate}T00:00:00Z`).getUTCDate()}</strong></div>
                <div className="event-main"><div className="event-title-line"><span>{event.label}</span><h3>{event.name}</h3></div><p><MapPin /> {event.location}</p><div className="event-tags"><span>{event.eventType}</span><span>{event.raceFormat}</span><span>Priority {event.priority}</span></div><small>{event.notes}</small></div>
                <div className="event-countdown"><strong>{Math.abs(event.daysAway)}</strong><span>{event.daysAway >= 0 ? "days" : "days ago"}</span></div>
                {event.eventType.toLowerCase().includes("hyrox") ? (
                  <Button variant={hasReview ? "outline" : "default"} disabled={!reviewReady} onClick={() => onNavigate("events", { origin: route.origin, eventId: event.id })}>
                    {reviewReady ? <Trophy /> : <LockKeyhole />}{hasReview ? "Open review" : reviewReady ? "Complete race review" : "Review after race"}
                  </Button>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      {reviewEvent ? (
        <RaceReviewDialog
          key={reviewEvent.id}
          event={reviewEvent}
          data={data}
          open
          onOpenChange={(open) => !open && onBack()}
          mutate={mutate}
        />
      ) : null}
    </div>
  );
}

function NewBlockDialog({ open, onOpenChange, mutate }: { open: boolean; onOpenChange: (value: boolean) => void; mutate: Mutate }) {
  const [form, setForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    trainingGoal: "",
    eventName: "",
    eventDate: "",
    eventLocation: "",
    eventType: "HYROX",
    raceFormat: "Mixed Doubles",
    partner: "KT / Thomas",
    priority: "A",
    notes: "",
  });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    await mutate({ action: "createBlock", ...form }, "New training block and target event created");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="training-dialog new-block-dialog" mode="responsive-editor">
        <DialogHeader><DialogTitle>New training block</DialogTitle><DialogDescription>Create durable phases and a target event without changing historical blocks.</DialogDescription></DialogHeader>
        <div className="dialog-form-grid">
          <div className="field-stack"><Label htmlFor="block-name">Block name</Label><Input id="block-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Spring 10K → Summer HYROX" /></div>
          <div className="two-field-grid"><div className="field-stack"><Label htmlFor="block-start">Start</Label><Input id="block-start" type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} /></div><div className="field-stack"><Label htmlFor="block-end">End</Label><Input id="block-end" type="date" value={form.endDate} onChange={(event) => update("endDate", event.target.value)} /></div></div>
          <div className="field-stack"><Label htmlFor="block-goal">Training goal</Label><Textarea id="block-goal" value={form.trainingGoal} onChange={(event) => update("trainingGoal", event.target.value)} placeholder="Goal, current strengths and weaknesses" /></div>
          <h3>Target event</h3>
          <div className="two-field-grid"><div className="field-stack"><Label htmlFor="event-name">Event name</Label><Input id="event-name" value={form.eventName} onChange={(event) => update("eventName", event.target.value)} /></div><div className="field-stack"><Label htmlFor="event-date">Event date</Label><Input id="event-date" type="date" value={form.eventDate} onChange={(event) => update("eventDate", event.target.value)} /></div></div>
          <div className="two-field-grid"><div className="field-stack"><Label htmlFor="event-location">Location</Label><Input id="event-location" value={form.eventLocation} onChange={(event) => update("eventLocation", event.target.value)} /></div><div className="field-stack"><Label htmlFor="event-priority">Priority</Label><Select value={form.priority} onValueChange={(value) => update("priority", value)}><SelectTrigger id="event-priority" className="full-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="A">A — key race</SelectItem><SelectItem value="B">B — important</SelectItem><SelectItem value="C">C — training event</SelectItem></SelectContent></Select></div></div>
          <div className="field-stack"><Label htmlFor="block-notes">Planning context</Label><Textarea id="block-notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Recurring classes, equipment, preferred days, deload frequency and long-run preference" /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={!form.name || !form.startDate || !form.endDate || !form.eventName || !form.eventDate}>Create block</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BlocksView({ data, mutate }: { data: AppData; mutate: Mutate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="view-stack">
      <section className="more-hero"><Layers3 /><div><p className="eyebrow">Long-term continuity</p><h1>Training blocks</h1><p>Build beyond London without losing the history that came before.</p></div></section>
      <Button className="create-block-button" onClick={() => setOpen(true)}><CalendarPlus /> New training block</Button>
      <div className="blocks-list">
        {data.blocks.map((block) => (
          <article className="block-card" key={block.id}><div className="block-status-line"><span>{block.status}</span><small>{formatDay(block.startDate, { weekday: undefined })} → {formatDay(block.endDate, { weekday: undefined })}</small></div><h2>{block.name}</h2><p>{block.trainingGoal}</p><div className="block-event-count"><CalendarCheck /> {data.events.filter((event) => event.blockId === block.id).length} linked events</div></article>
        ))}
      </div>
      <NewBlockDialog open={open} onOpenChange={setOpen} mutate={mutate} />
    </div>
  );
}

const workoutFamilies = [
  ["running", "Running"],
  ["hyrox", "HYROX"],
  ["strength", "Strength / accessory"],
  ["aerobic", "Aerobic"],
  ["other", "Other"],
] as const;
const workoutClassifications = [
  ["hard", "Hard Conditioning"],
  ["easy", "Easy Aerobic"],
  ["strength", "Strength"],
  ["recovery", "Recovery / Rest"],
] as const;
const workoutResultTypes = [
  ["completion", "Completion only"],
  ["average_pace", "Average pace"],
  ["total_time", "Total time"],
  ["distance", "Distance"],
  ["rounds", "Rounds"],
  ["reps", "Reps"],
  ["calories", "Calories"],
  ["custom_numeric", "Custom numeric result"],
] as const;

function WorkoutFormDialog({ item, open, onOpenChange, mutate, onSaved }: { item?: LibraryItem; open: boolean; onOpenChange: (value: boolean) => void; mutate: Mutate; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    family: item?.family ?? "running",
    category: item?.category ?? "easy",
    purpose: item?.purpose ?? "",
    estimatedDuration: item?.estimatedDuration ?? "",
    warmUp: item?.warmUp ?? "",
    mainSet: item?.mainSet ?? "",
    recovery: item?.recovery ?? "",
    intensityGuidance: item?.intensityGuidance ?? "",
    coolDown: item?.coolDown ?? "",
    equipment: item?.equipment ?? "",
    notes: item?.notes ?? "",
    resultType: item?.resultType ?? "completion",
    customResultLabel: item?.customResultLabel ?? "",
    favourite: item?.favourite ?? false,
  });
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const result = await mutate({ action: item ? "updateWorkout" : "createWorkout", workoutId: item?.id, ...form, prescription: form.mainSet }, item ? "Workout updated" : "Workout created");
    const id = String(result.workoutId ?? item?.id ?? "");
    onOpenChange(false);
    if (id) onSaved(id);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="training-dialog workout-form-dialog" mode="responsive-editor">
        <DialogHeader><DialogTitle>{item ? "Edit workout" : "Create workout"}</DialogTitle><DialogDescription>Reusable prescription and weekly training classification.</DialogDescription></DialogHeader>
        <div className="dialog-form-grid">
          <div className="field-stack"><Label htmlFor="workout-name">Name</Label><Input id="workout-name" value={form.name} onChange={(event) => update("name", event.target.value)} /></div>
          <div className="two-field-grid">
            <div className="field-stack"><Label htmlFor="workout-family">Category</Label><Select value={form.family} onValueChange={(value) => update("family", value)}><SelectTrigger id="workout-family" className="full-select"><SelectValue /></SelectTrigger><SelectContent>{workoutFamilies.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="field-stack"><Label htmlFor="workout-classification">Training intensity</Label><Select value={form.category} onValueChange={(value) => update("category", value)}><SelectTrigger id="workout-classification" className="full-select"><SelectValue /></SelectTrigger><SelectContent>{workoutClassifications.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="field-stack"><Label htmlFor="workout-purpose">Purpose</Label><Textarea id="workout-purpose" value={form.purpose} onChange={(event) => update("purpose", event.target.value)} /></div>
          <div className="field-stack"><Label htmlFor="workout-duration">Estimated duration</Label><Input id="workout-duration" placeholder="e.g. 45–60 min" value={form.estimatedDuration} onChange={(event) => update("estimatedDuration", event.target.value)} /></div>
          <div className="field-stack"><Label htmlFor="workout-warmup">Warm-up</Label><Textarea id="workout-warmup" value={form.warmUp} onChange={(event) => update("warmUp", event.target.value)} /></div>
          <div className="field-stack"><Label htmlFor="workout-main">Main workout</Label><Textarea id="workout-main" value={form.mainSet} onChange={(event) => update("mainSet", event.target.value)} /></div>
          <div className="field-stack"><Label htmlFor="workout-recovery">Recovery</Label><Textarea id="workout-recovery" value={form.recovery} onChange={(event) => update("recovery", event.target.value)} /></div>
          <div className="field-stack"><Label htmlFor="workout-intensity">Intensity guidance</Label><Textarea id="workout-intensity" value={form.intensityGuidance} onChange={(event) => update("intensityGuidance", event.target.value)} /></div>
          <div className="field-stack"><Label htmlFor="workout-cooldown">Cool-down</Label><Textarea id="workout-cooldown" value={form.coolDown} onChange={(event) => update("coolDown", event.target.value)} /></div>
          <div className="two-field-grid"><div className="field-stack"><Label htmlFor="workout-equipment">Equipment</Label><Textarea id="workout-equipment" value={form.equipment} onChange={(event) => update("equipment", event.target.value)} /></div><div className="field-stack"><Label htmlFor="workout-notes">Notes / coaching cues</Label><Textarea id="workout-notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} /></div></div>
          <div className="two-field-grid"><div className="field-stack"><Label htmlFor="workout-result">Result type</Label><Select value={form.resultType} onValueChange={(value) => update("resultType", value)}><SelectTrigger id="workout-result" className="full-select"><SelectValue /></SelectTrigger><SelectContent>{workoutResultTypes.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div>{form.resultType === "custom_numeric" ? <div className="field-stack"><Label htmlFor="custom-result-label">Custom result label</Label><Input id="custom-result-label" value={form.customResultLabel} onChange={(event) => update("customResultLabel", event.target.value)} /></div> : null}</div>
          <Label className="favourite-check" htmlFor="workout-favourite"><Checkbox id="workout-favourite" checked={form.favourite} onCheckedChange={(checked) => update("favourite", checked === true)} /><span><strong>Favourite</strong><small>Place this in your personal Favourites section.</small></span></Label>
        </div>
        <DialogFooter><Button onClick={save} disabled={!form.name || !form.mainSet}>Save workout</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddWorkoutToWeekDialog({ item, data, open, onOpenChange, mutate }: { item: LibraryItem; data: AppData; open: boolean; onOpenChange: (value: boolean) => void; mutate: Mutate }) {
  const [date, setDate] = useState(data.week.startDate);
  const [scope, setScope] = useState("me");
  const save = async () => { await mutate({ action: "addSession", weekId: data.week.id, workoutId: item.id, scheduledDate: date, scope }, `${item.name} added to ${scope === "both" ? "both plans" : "your plan"}`); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="training-dialog"><DialogHeader><DialogTitle>Add {item.name}</DialogTitle><DialogDescription>Choose a day and whether this is individual or together.</DialogDescription></DialogHeader><div className="dialog-form-grid"><div className="field-stack"><Label htmlFor="library-add-date">Day</Label><Input id="library-add-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><RadioGroup value={scope} onValueChange={setScope} className="scope-options"><Label className="scope-option" htmlFor="library-add-me"><RadioGroupItem id="library-add-me" value="me" /><span><strong>Add to my plan</strong><small>{data.partner?.displayName} is unchanged.</small></span></Label><Label className="scope-option" htmlFor="library-add-both"><RadioGroupItem id="library-add-both" value="both" /><span><strong>Add for both</strong><small>Creates linked sessions for Thomas and KT.</small></span></Label></RadioGroup></div><DialogFooter><Button onClick={save}>Add workout</Button></DialogFooter></DialogContent></Dialog>;
}

function WorkoutDetail({ item, data, mutate, route, onNavigate, onBack }: { item: LibraryItem; data: AppData; mutate: Mutate; route: AppRoute; onNavigate: (view: MainView, details?: Partial<AppRoute>, replace?: boolean) => void; onBack: () => void }) {
  const [editOpen, setEditOpen] = useState(false); const [addOpen, setAddOpen] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false);
  const sections = [["Purpose", item.purpose], ["Warm-up", item.warmUp], ["Main set", item.mainSet], ["Recovery", item.recovery], ["Intensity guidance", item.intensityGuidance], ["Cool-down", item.coolDown], ["Equipment", item.equipment], ["Notes / coaching cues", item.notes]].filter(([, value]) => value);
  const duplicate = async () => { const result = await mutate({ action: "duplicateWorkout", workoutId: item.id }, "Editable workout copy created"); const id = String(result.workoutId ?? ""); if (id) onNavigate("library", { origin: route.origin, workoutId: id }); };
  const remove = async () => { await mutate({ action: "deleteWorkout", workoutId: item.id }, "Workout deleted"); setDeleteOpen(false); onNavigate("library", { origin: route.origin }, true); };
  return <div className="view-stack"><button className="back-link" type="button" onClick={onBack}><ArrowLeft /> Back to Workout Library</button><section className="workout-detail-hero"><div><CategoryBadge category={item.category} /><span>{workoutFamilies.find(([value]) => value === item.family)?.[1] ?? item.family}</span>{item.favourite ? <Star className="favourite-star" /> : null}</div><h1>{item.name}</h1><p>{item.purpose}</p>{item.estimatedDuration ? <small>{item.estimatedDuration}</small> : null}</section><section className="workout-detail-actions"><Button onClick={() => data.week.confirmedAt ? setAddOpen(true) : onNavigate("week")}>{data.week.confirmedAt ? "Add to week" : "Plan week first"}</Button><Button variant="outline" onClick={() => mutate({ action: "toggleFavourite", workoutId: item.id }, item.favourite ? "Removed from Favourites" : "Added to Favourites")}><Star /> {item.favourite ? "Favourited" : "Favourite"}</Button><Button variant="outline" onClick={duplicate}><Copy /> Duplicate</Button>{item.canEdit ? <Button variant="outline" onClick={() => setEditOpen(true)}><Edit3 /> Edit</Button> : null}{item.canEdit ? <Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete</Button> : null}</section><section className="workout-detail-prescription">{sections.map(([label, value]) => <div key={label}><span>{label}</span><p>{value}</p></div>)}</section><section className="result-type-note"><strong>Results collected</strong><span>{workoutResultTypes.find(([value]) => value === item.resultType)?.[1] ?? "Completion"} · Session RPE · Feel · Notes</span></section><AddWorkoutToWeekDialog item={item} data={data} open={addOpen} onOpenChange={setAddOpen} mutate={mutate} />{item.canEdit ? <WorkoutFormDialog key={item.id} item={item} open={editOpen} onOpenChange={setEditOpen} mutate={mutate} onSaved={(id) => onNavigate("library", { origin: route.origin, workoutId: id }, true)} /> : null}<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this workout?</AlertDialogTitle><AlertDialogDescription>The reusable template will be removed. Existing planned sessions and historical results remain intact.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete workout</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}

export function LibraryView({ data, mutate, route, onNavigate, onBack }: { data: AppData; mutate: Mutate; route: AppRoute; onNavigate: (view: MainView, details?: Partial<AppRoute>, replace?: boolean) => void; onBack: () => void }) {
  const [filter, setFilter] = useState("favourites"); const [createOpen, setCreateOpen] = useState(false);
  const selected = data.workoutLibrary.find((item) => item.id === route.workoutId);
  if (selected) return <WorkoutDetail item={selected} data={data} mutate={mutate} route={route} onNavigate={onNavigate} onBack={onBack} />;
  const items = data.workoutLibrary.filter((item) => filter === "all" ? true : filter === "favourites" ? item.favourite : filter === "recent" ? item.isRecent : filter === "running" || filter === "hyrox" ? item.family === filter : item.category === filter);
  const filters = ["favourites", "all", "running", "hyrox", "easy", "hard", "strength", "recent"];
  return <div className="view-stack"><section className="more-hero"><Dumbbell /><div><p className="eyebrow">Reusable sessions</p><h1>Workout Library</h1><p>Complete prescriptions for planning, swapping and repeatable training.</p></div></section><Button className="create-block-button" onClick={() => setCreateOpen(true)}><CalendarPlus /> Create Workout</Button><div className="library-filter-row">{filters.map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item === "favourites" ? <Star /> : null}{item}</button>)}</div>{items.length ? <div className="library-list">{items.map((item) => <article className="library-card library-card-interactive" key={item.id}><button type="button" className="library-card-main" onClick={() => onNavigate("library", { origin: route.origin, workoutId: item.id })}><div><CategoryBadge category={item.category} compact /><span>{item.family}</span></div><h2>{item.name}</h2><p className="library-prescription">{item.prescription}</p><p>{item.purpose}</p></button><button className={item.favourite ? "library-star-button active" : "library-star-button"} type="button" aria-label={`${item.favourite ? "Remove" : "Add"} ${item.name} ${item.favourite ? "from" : "to"} favourites`} onClick={() => mutate({ action: "toggleFavourite", workoutId: item.id })}><Star /></button></article>)}</div> : <div className="empty-library-filter"><Star /><h3>No workouts here yet</h3><p>Create a workout or favourite an existing template.</p></div>}<WorkoutFormDialog open={createOpen} onOpenChange={setCreateOpen} mutate={mutate} onSaved={(id) => onNavigate("library", { origin: route.origin, workoutId: id })} /></div>;
}

export function CoachView() {
  const questions = ["Review my week", "Should I swap Thursday VO₂ for Saturday HYROX?", "How is my Smith squat progressing?", "What did KT do this week?"];
  return (
    <div className="view-stack">
      <section className="coach-hero"><div className="coach-orb"><Bot /></div><p className="eyebrow">Architecture ready</p><h1>Ask Coach</h1><p>The app stores the context a future coach needs, but no model connection is configured in this Sites runtime.</p></section>
      <section className="performance-card coach-status-card"><div><LockKeyhole /><span><strong>No simulated answers</strong><small>Core training does not depend on AI.</small></span></div><p>A native, securely authorised model invocation would need to be enabled for this Site. The server could then supply the signed-in athlete’s plan, targets, history, events and partner context. Any suggested plan change would still require confirmation.</p></section>
      <section><SectionHeading eyebrow="Ready questions" title="Coach entry points" /><div className="coach-question-list">{questions.map((question) => <button type="button" disabled key={question}><CircleHelp /><span>{question}</span><ChevronRight /></button>)}</div></section>
      <div className="coach-input-disabled"><Input disabled placeholder="Native model connection required" /><Button disabled><Sparkles /> Ask</Button></div>
    </div>
  );
}

export function SettingsView({ data, mutate, onNavigate }: { data: AppData; mutate: Mutate; onNavigate: (view: MainView, details?: Partial<AppRoute>, replace?: boolean) => void }) {
  const [displayName, setDisplayName] = useState(data.actor.displayName);
  const [increment, setIncrement] = useState(String(data.actor.loadIncrementKg ?? 2.5));
  const [days, setDays] = useState<string[]>(data.actor.preferredDays ?? []);
  const [titleBarColor, setTitleBarColor] = useState(data.actor.titleBarColor ?? "#000080");
  const [resetStage, setResetStage] = useState<"closed" | "first" | "final">("closed");
  const [holdSeconds, setHoldSeconds] = useState(5);
  const [holding, setHolding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const titleBarColors = [
    { value: "#000080", label: "Classic blue" },
    { value: "#1f4e78", label: "Ocean blue" },
    { value: "#006b6b", label: "System teal" },
    { value: "#2f6b57", label: "Muted green" },
    { value: "#4a5568", label: "Slate" },
    { value: "#5d3f78", label: "Soft violet" },
  ];
  const toggleDay = (day: string) => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  const cancelHold = () => {
    if (holdTimer.current !== null) window.clearInterval(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
    setHoldSeconds(5);
  };
  useEffect(() => () => cancelHold(), []);
  const executeReset = async () => {
    cancelHold();
    setResetting(true);
    try {
      await mutate({ action: "factoryResetTrainingData" }, "DUO / ENGINE reset complete");
      setResetStage("closed");
      onNavigate("home", {}, true);
    } catch {
      // mutate surfaces the failure toast; keep the danger-zone dialog open
      // so a failed request can be retried deliberately.
    } finally {
      setResetting(false);
    }
  };
  const beginHold = () => {
    if (holding || resetting) return;
    setHolding(true);
    setHoldSeconds(5);
    const startedAt = Date.now();
    holdTimer.current = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, 5 - elapsed);
      setHoldSeconds(Math.ceil(remaining));
      if (remaining <= 0) {
        if (holdTimer.current !== null) window.clearInterval(holdTimer.current);
        holdTimer.current = null;
        void executeReset();
      }
    }, 100);
  };
  return (
    <div className="view-stack">
      <section className="more-hero settings-hero"><Settings2 /><div><p className="eyebrow">Athlete settings</p><h1>Preferences</h1><p>Settings are tied to {data.actor.displayName}’s authenticated profile.</p></div></section>
      <section className="performance-card settings-form">
        <fieldset className="settings-group"><legend>Profile</legend><div className="field-stack"><Label htmlFor="display-name">Display name</Label><Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div><div className="field-stack"><Label htmlFor="units">Units</Label><Input id="units" value="Metric · kg · km · min/km" disabled /></div></fieldset>
        <fieldset className="settings-group"><legend>Training</legend><div className="field-stack"><Label htmlFor="load-increment">Default load increment (kg)</Label><Input id="load-increment" type="number" inputMode="decimal" min="0.5" step="0.5" value={increment} onChange={(event) => setIncrement(event.target.value)} /></div><div className="field-stack"><Label>Preferred training days</Label><div className="day-toggle-grid">{allDays.map((day) => <button type="button" className={days.includes(day) ? "day-toggle day-toggle-active" : "day-toggle"} onClick={() => toggleDay(day)} key={day}>{day.slice(0, 3)}</button>)}</div></div></fieldset>
        <fieldset className="settings-group title-colour-setting"><legend>Appearance</legend>
          <Label>Window title bar colour</Label>
          <p>Personal to {data.actor.displayName}. Active windows and selected taskbar items use this colour.</p>
          <RadioGroup value={titleBarColor} onValueChange={setTitleBarColor} className="title-colour-grid" aria-label="Window title bar colour">
            {titleBarColors.map((colour) => (
              <Label className={titleBarColor === colour.value ? "title-colour-option title-colour-option-active" : "title-colour-option"} key={colour.value}>
                <RadioGroupItem value={colour.value} />
                <span style={{ backgroundColor: colour.value }} aria-hidden="true" />
                <strong>{colour.label}</strong>
              </Label>
            ))}
          </RadioGroup>
          <div className="title-colour-preview" style={{ backgroundColor: titleBarColor }}><span>Preferences — {data.actor.displayName}</span><i>×</i></div>
        </fieldset>
        <fieldset className="settings-group"><legend>Account</legend><div className="settings-note"><LockKeyhole /><p>Your ChatGPT sign-in remains securely bound to this athlete profile. Changing the display name does not switch identity.</p></div></fieldset>
        <Button onClick={() => mutate({ action: "updateSettings", displayName, loadIncrementKg: increment, preferredDays: days, titleBarColor }, "Settings saved")}>Save settings</Button>
      </section>
      <section className="settings-danger-zone" aria-labelledby="factory-reset-heading">
        <div className="settings-danger-heading"><Trash2 aria-hidden="true" /><div><p className="eyebrow">Account · danger zone</p><h2 id="factory-reset-heading">Factory Reset Training Data</h2></div></div>
        <p>For testing and handover only. This resets transactional training data for both Thomas and KT, while keeping your accounts, programme structure and built-in library.</p>
        <Button type="button" variant="destructive" onClick={() => setResetStage("first")} disabled={resetting}><Trash2 aria-hidden="true" /> Factory Reset Training Data</Button>
      </section>
      <Dialog open={resetStage === "first"} onOpenChange={(open) => !open && setResetStage("closed")}>
        <DialogContent className="training-dialog factory-reset-dialog">
          <DialogHeader><DialogTitle>Reset all training data?</DialogTitle><DialogDescription>This affects both Thomas and KT. Completed workouts, running results, strength history, progression recommendations, plan changes, feed activity, race reviews, custom workouts and favourites will be deleted. Authentication, accounts, built-in exercises/workouts, the initial programme and events remain.</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setResetStage("closed")}>Cancel</Button><Button type="button" onClick={() => setResetStage("final")}>Continue</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={resetStage === "final"} onOpenChange={(open) => { if (!open && !resetting) { cancelHold(); setResetStage("closed"); } }}>
        <DialogContent className="training-dialog factory-reset-dialog">
          <DialogHeader><DialogTitle>Confirm permanent reset</DialogTitle><DialogDescription>This cannot be undone and clears testing/training records for both athletes. Accounts, authentication, built-in programme data and seeded race events are preserved. Press and hold the button for five seconds; releasing early cancels.</DialogDescription></DialogHeader>
          <div className="factory-reset-hold-wrap"><button type="button" className="factory-reset-hold" disabled={resetting} onClick={(event) => event.preventDefault()} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); beginHold(); }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={() => holding && cancelHold()} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) { event.preventDefault(); beginHold(); } }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cancelHold(); } }}><Trash2 aria-hidden="true" /><strong>{resetting ? "Resetting…" : holding ? `Hold… ${holdSeconds}` : "Hold 5 seconds to reset"}</strong><small>{holding ? `${holdSeconds} second${holdSeconds === 1 ? "" : "s"} remaining` : "Keep pressed; early release cancels"}</small></button><div className="factory-reset-progress" aria-hidden="true"><span style={{ width: `${((5 - holdSeconds) / 5) * 100}%` }} /></div></div>
          <DialogFooter><Button type="button" variant="outline" disabled={resetting || holding} onClick={() => { cancelHold(); setResetStage("closed"); }}>Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MoreViewRouter({
  view,
  data,
  mutate,
  route,
  onNavigate,
  onBack,
}: {
  view: MainView;
  data: AppData;
  mutate: Mutate;
  route: AppRoute;
  onNavigate: (view: MainView, details?: Partial<AppRoute>, replace?: boolean) => void;
  onBack: () => void;
}) {
  if (view === "events") return <EventsView data={data} mutate={mutate} route={route} onNavigate={onNavigate} onBack={onBack} />;
  if (view === "blocks") return <BlocksView data={data} mutate={mutate} />;
  if (view === "library") return <LibraryView data={data} mutate={mutate} route={route} onNavigate={onNavigate} onBack={onBack} />;
  if (view === "coach") return <CoachView />;
  if (view === "settings") return <SettingsView data={data} mutate={mutate} onNavigate={onNavigate} />;
  return null;
}
