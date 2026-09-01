"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  Mutate,
  Phase,
  PlannedWeek,
  TrainingBlock,
} from "@/lib/app-types";
import { formatDay } from "./common";

const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const dayLabels = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const priorityEmphases = ["balanced", "thomas", "kt"] as const;
type IntentDraft = {
  day: number;
  intent: string;
  workoutId: string;
  strengthTemplateId: string;
  progressionTrackId: string;
  locationId: string;
  priorityEmphasis: string;
  category: string;
  workoutKind: string;
  details: string;
  isQualityIntent: boolean;
};

function intentKind(intent: IntentDraft) {
  if (intent.workoutKind === "recovery")
    return "rest";
  if (intent.workoutId) return "workout";
  if (intent.strengthTemplateId) return "strength";
  if (intent.progressionTrackId) return "progression";
  return "generic";
}

function toIntentDraft(
  template: AppData["v2"]["weekTypeTemplates"][number],
): IntentDraft[] {
  return dayNames.map((_, day) => {
    const source = template.intents.find((item) => item.day === day);
    return {
      day,
      intent: source?.intent ?? "Rest / recovery",
      workoutId: source?.workoutId ?? "",
      strengthTemplateId: source?.strengthTemplateId ?? "",
      progressionTrackId: source?.progressionTrackId ?? "",
      locationId: source?.locationId ?? "",
      priorityEmphasis:
        source?.priorityEmphasis ?? template.priorityEmphasis ?? "balanced",
      category: source?.category ?? "recovery",
      workoutKind: source?.workoutKind ?? "recovery",
      details: source?.details ?? "",
      isQualityIntent: Boolean(source?.isQualityIntent),
    };
  });
}

function BlockEditor({
  block,
  mutate,
  onClose,
}: {
  block: TrainingBlock;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    name: block.name,
    startDate: block.startDate,
    endDate: block.endDate,
    trainingGoal: block.trainingGoal,
    notes: block.notes,
  });
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="training-dialog" mode="responsive-editor">
        <DialogHeader>
          <DialogTitle>Edit training block</DialogTitle>
          <DialogDescription>
            Changes never delete sessions, results or race events.
          </DialogDescription>
        </DialogHeader>
        <div className="dialog-form-grid">
          <div className="field-stack">
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </div>
          <div className="two-field-grid">
            <div className="field-stack">
              <Label>Start</Label>
              <Input
                type="date"
                value={draft.startDate}
                onChange={(event) =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
              />
            </div>
            <div className="field-stack">
              <Label>End</Label>
              <Input
                type="date"
                value={draft.endDate}
                onChange={(event) =>
                  setDraft({ ...draft, endDate: event.target.value })
                }
              />
            </div>
          </div>
          <div className="field-stack">
            <Label>Training goal</Label>
            <Textarea
              value={draft.trainingGoal}
              onChange={(event) =>
                setDraft({ ...draft, trainingGoal: event.target.value })
              }
            />
          </div>
          <div className="field-stack">
            <Label>Notes</Label>
            <Textarea
              value={draft.notes}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </div>
        </div>
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              try {
                await mutate(
                  { action: "updateBlock", blockId: block.id, ...draft },
                  "Training block saved",
                );
                onClose();
              } catch (mutationError) {
                setError(mutationError instanceof Error ? mutationError.message : "Training block could not be saved.");
              }
            }}
          >
            Save block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhaseEditor({
  block,
  phase,
  phases,
  mutate,
  onClose,
}: {
  block: TrainingBlock;
  phase: Phase | null;
  phases: Phase[];
  mutate: Mutate;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    id: phase?.id,
    name: phase?.name ?? "",
    startDate: phase?.startDate ?? block.startDate,
    endDate: phase?.endDate ?? block.endDate,
    focus: phase?.focus ?? "",
    sortOrder: phase?.sortOrder ?? 0,
  });
  const [error, setError] = useState("");
  const [splitPhaseId, setSplitPhaseId] = useState("");
  const phaseIndex = phases.findIndex((item) => item.id === phase?.id);
  const [absorbInto, setAbsorbInto] = useState<"previous" | "next">(phaseIndex > 0 ? "previous" : "next");
  const save = async () => {
    try {
      await mutate(
        {
          action: phase ? "updatePhase" : "createPhase",
          phaseId: draft.id,
          blockId: block.id,
          splitPhaseId: splitPhaseId || undefined,
          ...draft,
        },
        "Phase saved",
      );
      onClose();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Phase could not be saved.");
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="training-dialog" mode="responsive-editor">
        <DialogHeader>
          <DialogTitle>{phase ? "Edit phase" : "Add phase"}</DialogTitle>
          <DialogDescription>
            Phases stay inside the block and cannot overlap.
          </DialogDescription>
        </DialogHeader>
        <div className="dialog-form-grid">
          <div className="field-stack">
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </div>
          <div className="two-field-grid">
            <div className="field-stack">
              <Label>Start</Label>
              <Input
                type="date"
                value={draft.startDate}
                onChange={(event) =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
              />
            </div>
            <div className="field-stack">
              <Label>End</Label>
              <Input
                type="date"
                value={draft.endDate}
                onChange={(event) =>
                  setDraft({ ...draft, endDate: event.target.value })
                }
              />
            </div>
          </div>
          <div className="field-stack">
            <Label>Focus / description</Label>
            <Textarea
              value={draft.focus}
              onChange={(event) =>
                setDraft({ ...draft, focus: event.target.value })
              }
            />
          </div>
          {!phase ? (
            <div className="field-stack">
              <Label>Split an existing phase (optional)</Label>
              <Select value={splitPhaseId || "none"} onValueChange={(value) => setSplitPhaseId(value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Add without splitting" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Add without splitting</SelectItem>
                  {phases.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.startDate} → {item.endDate}</SelectItem>)}
                </SelectContent>
              </Select>
              <small className="muted-copy">Splitting adjusts the existing boundary in the same save.</small>
            </div>
          ) : null}
        </div>
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
        <DialogFooter>
          {phase ? (
            <>
              <Select value={absorbInto} onValueChange={(value) => setAbsorbInto(value as "previous" | "next")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {phaseIndex > 0 ? <SelectItem value="previous">Absorb into previous phase</SelectItem> : null}
                  {phaseIndex < phases.length - 1 ? <SelectItem value="next">Absorb into next phase</SelectItem> : null}
                </SelectContent>
              </Select>
              <Button variant="destructive" onClick={async () => { try { await mutate({ action: "deletePhase", phaseId: phase.id, absorbInto }, "Phase removed"); onClose(); } catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : "Phase could not be removed."); } }}>Remove phase</Button>
            </>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save phase</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WeekPreview({
  days,
}: {
  days: Array<{
    day: number;
    title: string;
    category?: string;
    locationId?: string | null;
  }>;
}) {
  return (
    <section className="programme-preview-panel">
      <h3>THIS WEEK WOULD BECOME</h3>
      {dayNames.map((day, index) => {
        const row = days.find((item) => item.day === index);
        return (
          <div className="programme-preview-row" key={day}>
            <strong>{day}</strong>
            <span>{row?.title ?? "Rest / recovery"}</span>
            <small>{row?.category ?? "recovery"}</small>
          </div>
        );
      })}
    </section>
  );
}

function WeekEditor({
  data,
  week,
  mutate,
  onClose,
}: {
  data: AppData;
  week: PlannedWeek;
  mutate: Mutate;
  onClose: () => void;
}) {
  const recommendation = data.v2.programmeRecommendations.find(
    (item) => item.weekId === week.id,
  );
  const [draft, setDraft] = useState({
    weekTypeId: recommendation?.weekTypeId ?? `week-type-${week.weekType}`,
    phaseId: recommendation?.phaseId ?? "",
    progressionTrackId: recommendation?.progressionTrackId ?? "",
    title: recommendation?.title ?? week.title,
    rationale: recommendation?.rationale ?? week.rationale,
  });
  const [progressionTouched, setProgressionTouched] = useState(false);
  const [preview, setPreview] = useState<
    Array<{
      day: number;
      title: string;
      category?: string;
      locationId?: string | null;
    }>
  >([]);
  const [error, setError] = useState("");
  const locked = Boolean(
    week.confirmedAt ||
    week.planningState === "in_progress" ||
    week.planningState === "complete",
  );
  const [snapshotState, setSnapshotState] = useState<"loading" | "available" | "unavailable">(locked ? "loading" : "available");
  const [snapshotMeta, setSnapshotMeta] = useState<{ weekType?: string; phase?: string; progression?: string } | null>(null);
  const selectedType = data.v2.weekTypeTemplates.find(
    (item) => item.id === draft.weekTypeId,
  );
  useEffect(() => {
    if (!locked) return;
    void mutate({ action: "viewProgrammeSnapshot", weekId: week.id }).then((result) => {
      const snapshot = result.snapshot as { materializedSessions?: Array<{ sortOrder?: number; title?: string; category?: string; locationId?: string | null }>; recommendation?: { weekTypeId?: string; phaseId?: string | null; progressionTrackId?: string | null; qualityIntent?: string } } | undefined;
      if (snapshot?.materializedSessions?.length === 7) {
        setSnapshotState("available");
        setPreview(snapshot.materializedSessions.map((row) => ({ day: row.sortOrder ?? 0, title: row.title ?? "Rest / recovery", category: row.category, locationId: row.locationId })));
        setSnapshotMeta({ weekType: snapshot.recommendation?.weekTypeId, phase: snapshot.recommendation?.phaseId ?? undefined, progression: snapshot.recommendation?.qualityIntent || snapshot.recommendation?.progressionTrackId || undefined });
      } else setSnapshotState("unavailable");
    }).catch(() => setSnapshotState("unavailable"));
  }, [locked, mutate, week.id]);
  useEffect(() => {
    if (locked) return;
    void mutate({
      action: "previewProgrammeWeek",
      weekId: week.id,
      weekTypeId: draft.weekTypeId,
      progressionTrackId: draft.progressionTrackId,
    }).then((result) => {
      if (Array.isArray(result.days))
        setPreview(
          result.days as Array<{
            day: number;
            title: string;
            category?: string;
            locationId?: string | null;
          }>,
        );
    });
  }, [draft.weekTypeId, draft.progressionTrackId, locked, mutate, week.id]);
  const fallbackPreview =
    selectedType?.intents.map((intent) => ({
      day: intent.day,
      title: intent.intent,
      category: intent.category,
      locationId: intent.locationId,
    })) ?? [];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="training-dialog" mode="responsive-editor">
        <DialogHeader>
          <DialogTitle>
            {locked
              ? "Programme snapshot"
              : `Edit programme week · W/C ${formatDay(week.startDate, { weekday: undefined })}`}
          </DialogTitle>
          <DialogDescription>
            {locked
              ? "This week has been Set. Programme Designer changes no longer alter the agreed week."
              : "The recommendation is separate from the agreed Week plan."}
          </DialogDescription>
        </DialogHeader>
        {locked ? (
          <p className="muted-panel">
            THIS WEEK HAS BEEN SET
            <br />
            Use Week to modify the live plan.
            {snapshotState === "available" && snapshotMeta ? (
              <><br /><small>Saved recommendation · {snapshotMeta.weekType ?? "Week Type"} · {snapshotMeta.phase ?? "phase preserved"} · {snapshotMeta.progression ?? "no progression"}</small></>
            ) : null}
          </p>
        ) : (
          <div className="dialog-form-grid">
            <div className="field-stack">
              <Label>Week Type</Label>
              <Select
                value={draft.weekTypeId}
                onValueChange={(value) => {
                  setDraft({
                    ...draft,
                    weekTypeId: value,
                    progressionTrackId: "",
                  });
                  setProgressionTouched(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.v2.weekTypeTemplates
                    .filter((item) => item.active !== false)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="field-stack">
              <Label>Phase</Label>
              <Select
                value={draft.phaseId || "none"}
                onValueChange={(value) =>
                  setDraft({ ...draft, phaseId: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No phase</SelectItem>
                  {data.phases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedType?.intents.some((intent) => intent.isQualityIntent) ? (
              <div className="field-stack">
                <Label>Quality progression</Label>
                <Select
                  value={draft.progressionTrackId || "none"}
                  onValueChange={(value) => {
                    setDraft({
                      ...draft,
                      progressionTrackId: value === "none" ? "" : value,
                    });
                    setProgressionTouched(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No progression</SelectItem>
                    {data.v2.progressionTracks.map((track) => (
                      <SelectItem key={track.id} value={track.id}>
                        {track.name}
                        {track.currentStep >= track.steps.length
                          ? " · complete"
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="field-stack">
              <Label>Title override</Label>
              <Input
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </div>
            <div className="field-stack">
              <Label>Rationale</Label>
              <Textarea
                value={draft.rationale}
                onChange={(event) =>
                  setDraft({ ...draft, rationale: event.target.value })
                }
              />
            </div>
          </div>
        )}
        {!locked ? <WeekPreview days={preview.length ? preview : fallbackPreview} /> : snapshotState === "available" ? <WeekPreview days={preview} /> : <p className="editor-error" role="status">Historical programme snapshot unavailable</p>}
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
        <DialogFooter>
          {!locked ? (
            <Button
              onClick={async () => {
                try {
                  await mutate(
                    { action: "updateProgrammeWeek", weekId: week.id, ...draft, progressionIsOverride: progressionTouched || Boolean(recommendation?.progressionIsOverride) },
                    "Programme week saved",
                  );
                  onClose();
                } catch (mutationError) {
                  setError(mutationError instanceof Error ? mutationError.message : "Programme week could not be saved.");
                }
              }}
            >
              Save programme week
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WeekTypeEditor({
  template,
  data,
  mutate,
  onClose,
  onSaved,
}: {
  template: AppData["v2"]["weekTypeTemplates"][number];
  data: AppData;
  mutate: Mutate;
  onClose: () => void;
  onSaved: (templateId: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: template.name,
    rationale: template.rationale,
    hardTarget: String(template.hardTarget),
    strengthTarget: String(template.strengthTarget),
    easyTarget: String(template.easyTarget),
    defaultLocationId: template.defaultLocationId ?? "",
    priorityEmphasis: template.priorityEmphasis,
  });
  const [intents, setIntents] = useState<IntentDraft[]>(() =>
    toIntentDraft(template),
  );
  const [error, setError] = useState("");
  const updateIntent = (day: number, update: Partial<IntentDraft>) =>
    setIntents((current) =>
      current.map((item) =>
        item.day === day
          ? { ...item, ...update }
          : update.isQualityIntent
            ? { ...item, isQualityIntent: false }
            : item,
      ),
    );
  const save = async () => {
    try {
      await mutate(
        {
          action: "updateWeekTypeTemplate",
          templateId: template.id,
          ...draft,
          intents,
        },
        "Week Type saved",
      );
      onSaved(template.id);
      onClose();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Week Type could not be saved.");
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="training-dialog week-type-editor-dialog"
        mode="responsive-editor"
      >
        <DialogHeader>
          <DialogTitle>Edit Week Type</DialogTitle>
          <DialogDescription>
            Seven daily intents are validated together before the template is
            replaced.
          </DialogDescription>
        </DialogHeader>
        <div className="dialog-form-grid">
          <div className="field-stack">
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </div>
          <div className="field-stack">
            <Label>Rationale</Label>
            <Textarea
              value={draft.rationale}
              onChange={(event) =>
                setDraft({ ...draft, rationale: event.target.value })
              }
            />
          </div>
          <div className="three-field-grid">
            {(
              [
                ["hardTarget", "Hard target"],
                ["strengthTarget", "Strength target"],
                ["easyTarget", "Easy target"],
              ] as const
            ).map(([key, label]) => (
              <div className="field-stack" key={key}>
                <Label>{label}</Label>
                <Input
                  type="number"
                  min="0"
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              </div>
            ))}
          </div>
          <div className="two-field-grid">
            <div className="field-stack">
              <Label>Priority emphasis</Label>
              <Select
                value={draft.priorityEmphasis}
                onValueChange={(value) =>
                  setDraft({ ...draft, priorityEmphasis: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityEmphases.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item === "balanced"
                        ? "Balanced"
                        : item === "thomas"
                          ? "Thomas"
                          : "KT"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="field-stack">
              <Label>Default location</Label>
              <Select
                value={draft.defaultLocationId || "none"}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    defaultLocationId: value === "none" ? "" : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use current location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    None / current resolution
                  </SelectItem>
                  {data.v2.locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <section className="week-type-intents">
            <h3>Monday–Sunday intents</h3>
            {intents.map((intent) => {
              const isRest = intentKind(intent) === "rest";
              return (
                <article className="week-type-intent-row" key={intent.day}>
                  <div className="week-type-intent-heading">
                    <strong>{dayLabels[intent.day]}</strong>
                    <label>
                      <input
                        type="checkbox"
                        disabled={isRest}
                        checked={intent.isQualityIntent}
                        onChange={(event) =>
                          updateIntent(intent.day, {
                            isQualityIntent: event.target.checked,
                          })
                        }
                      />{" "}
                      Use this day for programme progression
                    </label>
                  </div>
                  <div className="field-stack">
                    <Label>Session type</Label>
                    <Select
                      value={intentKind(intent)}
                      onValueChange={(value) => {
                        const base = {
                          workoutId: "",
                          strengthTemplateId: "",
                          progressionTrackId: "",
                          category:
                            value === "rest"
                              ? "recovery"
                              : value === "strength"
                                ? "strength"
                                : value === "workout" || value === "progression"
                                  ? "hard"
                                  : intent.category,
                          workoutKind: value === "rest" ? "recovery" : value,
                        };
                        updateIntent(intent.day, {
                          ...base,
                          isQualityIntent:
                            value === "rest" ? false : intent.isQualityIntent,
                          intent:
                            value === "rest"
                              ? "Rest / recovery"
                              : intent.intent,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rest">Rest / Recovery</SelectItem>
                        <SelectItem value="workout">Fixed workout</SelectItem>
                        <SelectItem value="strength">
                          Strength template
                        </SelectItem>
                        <SelectItem value="progression">
                          Progression track
                        </SelectItem>
                        <SelectItem value="generic">
                          Generic session intent
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {intentKind(intent) === "workout" ? (
                    <div className="field-stack">
                      <Label>Workout</Label>
                      <Select
                        value={intent.workoutId || "none"}
                        onValueChange={(value) =>
                          updateIntent(intent.day, {
                            workoutId: value === "none" ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose workout" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Choose workout</SelectItem>
                          {data.workoutLibrary.map((workout) => (
                            <SelectItem key={workout.id} value={workout.id}>
                              {workout.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {intentKind(intent) === "strength" ? (
                    <div className="field-stack">
                      <Label>Strength template</Label>
                      <Select
                        value={intent.strengthTemplateId || "none"}
                        onValueChange={(value) =>
                          updateIntent(intent.day, {
                            strengthTemplateId: value === "none" ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Choose template</SelectItem>
                          {data.v2.strengthTemplates.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {intentKind(intent) === "progression" ? (
                    <div className="field-stack">
                      <Label>Progression</Label>
                      <Select
                        value={intent.progressionTrackId || "none"}
                        onValueChange={(value) =>
                          updateIntent(intent.day, {
                            progressionTrackId: value === "none" ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose progression" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            Choose progression
                          </SelectItem>
                          {data.v2.progressionTracks.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {intentKind(intent) !== "rest" ? (
                    <div className="field-stack">
                      <Label>Day priority emphasis</Label>
                      <Select
                        value={intent.priorityEmphasis}
                        onValueChange={(value) =>
                          updateIntent(intent.day, { priorityEmphasis: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorityEmphases.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item === "balanced"
                                ? "Balanced"
                                : item === "thomas"
                                  ? "Thomas"
                                  : "KT"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="two-field-grid">
                    <div className="field-stack">
                      <Label>Intent / title</Label>
                      <Input
                        value={intent.intent}
                        onChange={(event) =>
                          updateIntent(intent.day, {
                            intent: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="field-stack">
                      <Label>Location</Label>
                      <Select
                        value={intent.locationId || "none"}
                        onValueChange={(value) =>
                          updateIntent(intent.day, {
                            locationId: value === "none" ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Use current location" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            Use current location
                          </SelectItem>
                          {data.v2.locations.map((location) => (
                            <SelectItem key={location.id} value={location.id}>
                              {location.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {intentKind(intent) === "generic" ? (
                    <>
                      <div className="field-stack">
                        <Label>Training classification</Label>
                        <Select
                          value={intent.category}
                          onValueChange={(value) =>
                            updateIntent(intent.day, { category: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["hard", "easy", "strength", "recovery"].map(
                              (item) => (
                                <SelectItem key={item} value={item}>
                                  {item[0].toUpperCase() + item.slice(1)}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="field-stack">
                        <Label>Modality / workout kind</Label>
                        <Input
                          value={intent.workoutKind}
                          onChange={(event) =>
                            updateIntent(intent.day, {
                              workoutKind: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="field-stack">
                        <Label>Details</Label>
                        <Textarea
                          value={intent.details}
                          onChange={(event) =>
                            updateIntent(intent.day, {
                              details: event.target.value,
                            })
                          }
                          placeholder="Purpose and coaching details"
                        />
                      </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </section>
        </div>
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save Week Type</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateDialog({
  template,
  mutate,
  onClose,
  onDuplicated,
}: {
  template: AppData["v2"]["weekTypeTemplates"][number];
  mutate: Mutate;
  onClose: () => void;
  onDuplicated: (template: AppData["v2"]["weekTypeTemplates"][number]) => void;
}) {
  const [name, setName] = useState(`${template.name} copy`);
  const [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="training-dialog" mode="responsive-editor">
        <DialogHeader>
          <DialogTitle>Duplicate Week Type</DialogTitle>
          <DialogDescription>
            The original template remains unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="field-stack">
          <Label>New Week Type name</Label>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        {error ? <p className="editor-error" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              try {
                const result = await mutate({ action: "duplicateWeekType", templateId: template.id, name: name.trim() }, "Week Type duplicated");
                if (typeof result.templateId === "string") onDuplicated({ ...template, id: result.templateId, name: name.trim(), isBuiltIn: false, active: true });
                onClose();
              } catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : "Week Type could not be duplicated."); }
            }}
          >
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProgrammeDesignerUI({
  data,
  mutate,
}: {
  data: AppData;
  mutate: Mutate;
}) {
  const [tab, setTab] = useState("map");
  const [editingWeek, setEditingWeek] = useState<PlannedWeek | null>(null);
  const [editingType, setEditingType] = useState<
    AppData["v2"]["weekTypeTemplates"][number] | null
  >(null);
  const [duplicateType, setDuplicateType] = useState<
    AppData["v2"]["weekTypeTemplates"][number] | null
  >(null);
  const [blockEditor, setBlockEditor] = useState(false);
  const [phaseEditor, setPhaseEditor] = useState<Phase | null | false>(false);
  const [baseTemplate, setBaseTemplate] = useState<
    AppData["v2"]["weekTypeTemplates"][number] | null
  >(null);
  const [propagationTemplate, setPropagationTemplate] = useState<string | null>(
    null,
  );
  const [resetTemplate, setResetTemplate] = useState<
    AppData["v2"]["weekTypeTemplates"][number] | null
  >(null);
  const [propagationImpact, setPropagationImpact] = useState<{ eligibleCount: number; protectedCount: number; conflicts: string[] } | null>(null);
  const [actionError, setActionError] = useState("");
  const [resetError, setResetError] = useState("");
  const [propagationError, setPropagationError] = useState("");
  const phases = useMemo(
    () =>
      [...data.phases].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [data.phases],
  );
  const eligibleCount = propagationTemplate
    ? data.weeks.filter(
        (week) =>
          !week.confirmedAt &&
          !["in_progress", "complete"].includes(week.planningState) &&
          data.v2.programmeRecommendations.some(
            (recommendation) =>
              recommendation.weekId === week.id &&
              recommendation.weekTypeId === propagationTemplate,
          ),
      ).length
    : 0;
  useEffect(() => {
    if (!propagationTemplate) return;
    void mutate({ action: "previewWeekTypePropagation", templateId: propagationTemplate }).then((result) => {
      if (typeof result.eligibleCount === "number") setPropagationImpact({ eligibleCount: result.eligibleCount, protectedCount: Number(result.protectedCount ?? 0), conflicts: Array.isArray(result.conflicts) ? result.conflicts as string[] : [] });
    });
  }, [mutate, propagationTemplate]);
  const openBase = async (
    template: AppData["v2"]["weekTypeTemplates"][number],
  ) => {
    const result = await mutate({
      action: "viewDuoBase",
      templateId: template.id,
    });
    if (result.template)
      setBaseTemplate(
        result.template as AppData["v2"]["weekTypeTemplates"][number],
      );
    else setBaseTemplate(template);
  };
  const tabs = [
    "overview",
    "map",
    "week types",
    "progressions",
    "training focuses",
  ];
  return (
    <>
      <div className="view-stack programme-designer">
        <section className="more-hero programme-hero">
          <div>
            <p className="eyebrow">Where are we heading?</p>
            <h1>Programme Designer</h1>
            <p>
              Edit the DUO recommendation without turning the block into a
              blank-sheet calendar.
            </p>
          </div>
        </section>
        <nav
          className="programme-tabs"
          aria-label="Programme Designer sections"
        >
          {tabs.map((item) => (
            <button
              type="button"
              className={tab === item ? "active" : ""}
              key={item}
              onClick={() => setTab(item)}
            >
              {item === "map" ? "Programme Map" : item}
            </button>
          ))}
        </nav>
        {tab === "overview" ? (
          <>
            <section className="programme-overview-card">
              <div>
                <p className="eyebrow">Current training block</p>
                <h2>{data.block.name}</h2>
                <p>{data.block.trainingGoal}</p>
                <small>
                  {formatDay(data.block.startDate, { weekday: undefined })} →{" "}
                  {formatDay(data.block.endDate, { weekday: undefined })} ·{" "}
                  {data.weeks.length} programme weeks · {data.phases.length}{" "}
                  phases
                </small>
              </div>
              <div className="dialog-actions">
                <Button variant="outline" onClick={() => setBlockEditor(true)}>
                  Edit training block
                </Button>
              </div>
            </section>
            <section>
              <div className="section-heading-row">
                <div>
                  <p className="eyebrow">Programme structure</p>
                  <h2>Phases</h2>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPhaseEditor(null)}
                >
                  + Add Phase
                </Button>
              </div>
              <div className="programme-phase-list">
                {phases.map((phase, index) => (
                  <article key={phase.id}>
                    <span className="programme-phase-number">{index + 1}</span>
                    <div>
                      <strong>{phase.name}</strong>
                      <small>
                        {formatDay(phase.startDate, { weekday: undefined })} →{" "}
                        {formatDay(phase.endDate, { weekday: undefined })}
                      </small>
                      <p>{phase.focus}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPhaseEditor(phase)}
                    >
                      Edit
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
        {tab === "map" ? (
          <section>
            <p className="muted-panel">
              The Programme Map is the recommendation layer. Set weeks become
              snapshots and remain protected here.
            </p>
            <div className="programme-map-list">
              {data.weeks.map((week) => {
                const rec = data.v2.programmeRecommendations.find(
                  (item) => item.weekId === week.id,
                );
                const locked = Boolean(
                  week.confirmedAt ||
                  week.planningState === "in_progress" ||
                  week.planningState === "complete",
                );
                const statusLabel = week.planningState === "complete" ? "COMPLETE" : week.planningState === "in_progress" ? "IN PROGRESS" : week.confirmedAt ? "SET" : "FUTURE";
                const phase = data.phases.find(
                  (item) => item.id === rec?.phaseId,
                );
                const template = data.v2.weekTypeTemplates.find(
                  (item) => item.id === rec?.weekTypeId,
                );
                const track = data.v2.progressionTracks.find(
                  (item) => item.id === rec?.progressionTrackId,
                );
                const step =
                  track && track.currentStep < track.steps.length
                    ? track.steps[track.currentStep]
                    : null;
                return (
                  <article className="programme-map-row" key={week.id}>
                    <div>
                      <strong>
                        W/C {formatDay(week.startDate, { weekday: undefined })}
                      </strong>
                      <span>
                        {phase?.name ?? "Unassigned phase"} ·{" "}
                        {template?.name ?? week.weekType}
                      </span>
                      <small>
                        {track
                          ? `${track.name} · ${step?.title ?? "Progression complete"}`
                          : rec?.qualityIntent || "No quality progression"}
                      </small>
                    </div>
                    <span className="status-badge">
                      {statusLabel}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingWeek(week)}
                    >
                      {locked ? "View" : "Edit"}
                    </Button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
        {tab === "week types" ? (
          <section>
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Reusable templates</p>
                <h2>Week Types</h2>
              </div>
              <Button size="sm" onClick={async () => {
                try {
                  setActionError("");
                  const result = await mutate({ action: "createWeekType", name: "New Week Type" }, "Week Type created");
                  if (typeof result.templateId === "string") setEditingType({ id: result.templateId, name: "New Week Type", rationale: "", hardTarget: 0, strengthTarget: 0, easyTarget: 0, defaultLocationId: null, priorityEmphasis: "balanced", isBuiltIn: false, active: true, intents: dayNames.map((_, day) => ({ id: `${result.templateId}-${day}`, day, intent: "Rest / recovery", workoutId: null, strengthTemplateId: null, progressionTrackId: null, locationId: null, priorityEmphasis: "balanced", category: "recovery", workoutKind: "recovery", details: "", isQualityIntent: false })) });
                } catch (error) { setActionError(error instanceof Error ? error.message : "Week Type could not be created."); }
              }}>+ New Week Type</Button>
            </div>
            {actionError ? <p className="editor-error" role="alert">{actionError}</p> : null}
            <div className="programme-template-list">
              {data.v2.weekTypeTemplates.map((template) => (
                <article className="programme-template-card" key={template.id}>
                  <div>
                    <span className="eyebrow">
                      {template.isBuiltIn ? "DUO base" : "Custom"}
                    </span>
                    <h3>{template.name}</h3>
                    <p>{template.rationale}</p>
                    <small>
                      Hard {template.hardTarget} · Strength{" "}
                      {template.strengthTarget} · Easy {template.easyTarget} ·{" "}
                      {template.intents.length}/7 days configured
                    </small>
                  </div>
                  <div className="dialog-actions">
                    <Button
                      variant="outline"
                      onClick={() => setEditingType(template)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDuplicateType(template)}
                    >
                      Duplicate
                    </Button>
                    {!template.isBuiltIn ? (
                      <Button
                        variant="outline"
                        onClick={() => void mutate({ action: "disableWeekType", templateId: template.id }, "Week Type disabled")}
                      >
                        Disable
                      </Button>
                    ) : null}
                    {template.isBuiltIn ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => void openBase(template)}
                        >
                          View DUO base
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setResetTemplate(template)}
                        >
                          Reset to DUO base
                        </Button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {tab === "progressions" ? (
          <section>
            <p className="muted-panel">
              Progression tracks are shown here as programme context. Completion
              is recorded in Train.
            </p>
            <div className="progression-track-list">
              {data.v2.progressionTracks.map((track) => (
                <article className="progression-track-card" key={track.id}>
                  <h3>{track.name}</h3>
                  <p>{track.purpose}</p>
                  <ol>
                    {track.steps.map((step, index) => (
                      <li
                        className={
                          index === track.currentStep
                            ? "progression-step-current"
                            : index < track.currentStep
                              ? "progression-step-complete"
                              : ""
                        }
                        key={step.id}
                      >
                        <span>{index + 1}</span>
                        <div>
                          <strong>{step.title}</strong>
                          <small>{step.prescription}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {track.currentStep >= track.steps.length ? (
                    <p className="muted-panel">Progression complete</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {tab === "training focuses" ? (
          <section>
            <p className="muted-panel">
              Training Focus comes before exercise selection. Alternatives stay
              within the focus; changing focus is a programming decision.
            </p>
            <div className="focus-taxonomy-grid">
              {data.v2.trainingFocuses.map((focus) => (
                <article key={focus.id}>
                  <h3>{focus.name}</h3>
                  <p>{focus.purpose}</p>
                  <small>
                    {focus.primaryMuscles} · {focus.defaultPrescription}
                  </small>
                  <span>Helps with: {focus.hyroxLinks.join(" · ") || "—"}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      {blockEditor ? (
        <BlockEditor
          block={data.block}
          mutate={mutate}
          onClose={() => setBlockEditor(false)}
        />
      ) : null}
      {phaseEditor !== false ? (
        <PhaseEditor
          block={data.block}
          phase={phaseEditor}
          phases={phases}
          mutate={mutate}
          onClose={() => setPhaseEditor(false)}
        />
      ) : null}
      {editingWeek ? (
        <WeekEditor
          data={data}
          week={editingWeek}
          mutate={mutate}
          onClose={() => setEditingWeek(null)}
        />
      ) : null}
      {editingType ? (
        <WeekTypeEditor
          template={editingType}
          data={data}
          mutate={mutate}
          onClose={() => setEditingType(null)}
          onSaved={setPropagationTemplate}
        />
      ) : null}
      {duplicateType ? (
        <DuplicateDialog
          template={duplicateType}
          mutate={mutate}
          onClose={() => setDuplicateType(null)}
          onDuplicated={(copy) => setEditingType(copy)}
        />
      ) : null}
      {baseTemplate ? (
        <Dialog open onOpenChange={(open) => !open && setBaseTemplate(null)}>
          <DialogContent className="training-dialog" mode="responsive-editor">
            <DialogHeader>
              <DialogTitle>DUO base · {baseTemplate.name}</DialogTitle>
              <DialogDescription>
                Reference content for this built-in template. Reset restores
                these values without changing Set weeks.
              </DialogDescription>
            </DialogHeader>
            <div className="dialog-form-grid">
              <p>
                <strong>{baseTemplate.rationale}</strong>
              </p>
              <p>
                Targets: Hard {baseTemplate.hardTarget} · Strength{" "}
                {baseTemplate.strengthTarget} · Easy {baseTemplate.easyTarget}
              </p>
              <section className="week-type-intents">
                {toIntentDraft(baseTemplate).map((intent) => (
                  <div className="programme-preview-row" key={intent.day}>
                    <strong>{dayNames[intent.day]}</strong>
                    <span>{intent.intent}</span>
                    <small>{intent.category}</small>
                  </div>
                ))}
              </section>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBaseTemplate(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {resetTemplate ? (
        <Dialog open onOpenChange={(open) => !open && setResetTemplate(null)}>
          <DialogContent className="training-dialog" mode="responsive-editor">
            <DialogHeader>
              <DialogTitle>RESET {resetTemplate.name.toUpperCase()}?</DialogTitle>
              <DialogDescription>This restores the original DUO base Week Type. Set and completed weeks will not change.</DialogDescription>
            </DialogHeader>
            <p className="muted-panel">Future unset programme weeks are not changed unless you explicitly choose to update them.</p>
            {resetError ? <p className="editor-error" role="alert">{resetError}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetTemplate(null)}>Cancel</Button>
              <Button onClick={async () => { try { setResetError(""); await mutate({ action: "resetWeekTypeTemplate", templateId: resetTemplate.id }, "Week Type reset to DUO base"); setResetTemplate(null); setPropagationTemplate(resetTemplate.id); } catch (error) { setResetError(error instanceof Error ? error.message : "Week Type could not be reset."); } }}>Reset to DUO base</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {propagationTemplate ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setPropagationTemplate(null)}
        >
          <DialogContent className="training-dialog" mode="responsive-editor">
            <DialogHeader>
              <DialogTitle>Update future Programme Weeks?</DialogTitle>
              <DialogDescription>
                {propagationImpact?.eligibleCount ?? eligibleCount} future unset week
                {(propagationImpact?.eligibleCount ?? eligibleCount) === 1 ? "" : "s"} currently use this Week Type.
                Set and completed weeks are protected.
              </DialogDescription>
            </DialogHeader>
            <p className="muted-panel">
              Your Week Type change is saved. Keep existing programme weeks, or
              explicitly apply the new template to eligible future unset weeks.
            </p>
            {propagationImpact?.conflicts.length ? <p className="muted-panel">{propagationImpact.conflicts.length} week{propagationImpact.conflicts.length === 1 ? "" : "s"} have an explicit progression that needs manual review and will be protected.</p> : null}
            {propagationError ? <p className="editor-error" role="alert">{propagationError}</p> : null}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPropagationTemplate(null)}
              >
                Keep existing weeks
              </Button>
              <Button
                onClick={async () => {
                  try {
                    setPropagationError("");
                    await mutate({ action: "updateFutureWeeksFromWeekType", templateId: propagationTemplate }, `Updated ${propagationImpact?.eligibleCount ?? eligibleCount} future week${(propagationImpact?.eligibleCount ?? eligibleCount) === 1 ? "" : "s"}`);
                    setPropagationTemplate(null);
                  } catch (error) { setPropagationError(error instanceof Error ? error.message : "Future programme weeks could not be updated."); }
                }}
              >
                Update future weeks
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
