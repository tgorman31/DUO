import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { ensureSeeded, rebuildWeekSessions, resetTrainingData, type TrainingDb } from "@/db/seed";
import {
  reconcileRecommendedWeek,
  reconcileV2RecommendedWeek,
  resolveV2ProgrammeRows,
  applyWeekTypeTemplatePropagation,
  setProgrammeWeekType,
  unsetWeekPlanningState,
} from "@/db/week-planning";
import {
  activityFeedItems,
  athleteExerciseSettings,
  athleteSessions,
  athletes,
  events,
  exercisePerformances,
  exercises,
  plannedWeeks,
  planHistoryItems,
  progressionStates,
  raceReviews,
  reactions,
  sharedSessions,
  slotAlternatives,
  strengthSets,
  strengthSlots,
  trainingBlocks,
  trainingPhases,
  workoutLibraryItems,
  workoutFavourites,
  workoutResults,
  athleteCurrentLocations,
  athleteHyroxPriorities,
  catalogueExercises,
  locationEquipment,
  programmeWeekRecommendations,
  programmeWeekDayIntents,
  progressionSteps,
  progressionStatesV2,
  progressionTracks,
  strengthFocusSlots,
  strengthTemplates,
  trainingFocuses,
  trainingLocations,
  weekTypeDayIntents,
  weekTypeTemplates,
  workoutHyroxCoverage,
} from "@/db/schema";
import {
  addDays,
  TEAM_ID,
  WEEK_TYPE_INFO,
  workoutTemplateIdForSession,
} from "@/lib/training-data";
import { V2_HYROX_STATIONS } from "@/lib/v2-catalogue";
import { categoryTotals } from "@/lib/training-logic";
import { d1InsertBatches } from "@/lib/d1-limits";
import { completeStrengthEntries } from "@/lib/strength-completion";
import { completeProgressionForSession } from "@/lib/progression-completion";
import { cloneStrengthTemplate } from "@/lib/strength-template";

export const dynamic = "force-dynamic";

type Athlete = typeof athletes.$inferSelect;

const validCategories = new Set(["hard", "strength", "easy", "recovery"]);
const validWorkoutFamilies = new Set(["running", "hyrox", "strength", "aerobic", "other"]);
const validResultTypes = new Set([
  "completion",
  "average_pace",
  "total_time",
  "distance",
  "rounds",
  "reps",
  "calories",
  "custom_numeric",
]);
const validLoadConventions = new Set([
  "total_load",
  "per_hand",
  "machine_stack",
  "bodyweight_plus",
  "single_load",
  "time",
  "distance",
]);
const validReactions = new Set(["❤️", "👍", "🔥", "💦"]);
const validTitleBarColors = new Set([
  "#000080",
  "#1f4e78",
  "#006b6b",
  "#2f6b57",
  "#4a5568",
  "#5d3f78",
]);

function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function nextIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function phaseCoverageError(phases: Array<{ startDate: string; endDate: string }>, block: { startDate: string; endDate: string }) {
  const ordered = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!ordered.length) return "At least one phase is required to cover the training block.";
  if (ordered[0].startDate !== block.startDate) return `Programme phases leave ${block.startDate}–${nextIsoDate(ordered[0].startDate)} uncovered.`;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].startDate !== nextIsoDate(ordered[index - 1].endDate)) return `Programme phases leave ${nextIsoDate(ordered[index - 1].endDate)}–${nextIsoDate(ordered[index].startDate)} uncovered.`;
  }
  if (ordered.at(-1)?.endDate !== block.endDate) return `Programme phases leave ${nextIsoDate(ordered.at(-1)?.endDate ?? block.startDate)}–${block.endDate} uncovered.`;
  return null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number | null = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(value: unknown) {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.ceil((end - start) / 86_400_000);
}

function planningStateFor(
  week: { startDate: string; confirmedAt: string | null },
  rows: Array<{ status: string }>,
  today: string,
) {
  if (!week.confirmedAt) return "recommended" as const;
  if (today > addDays(week.startDate, 6)) return "complete" as const;
  return rows.some((row) => row.status === "completed")
    ? ("in_progress" as const)
    : ("set" as const);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function currentIdentity() {
  const user = await getChatGPTUser();
  if (!user) return null;
  return user;
}

async function resolveAthlete(
  db: TrainingDb,
  user: ChatGPTUser,
): Promise<Athlete | null> {
  const [existing] = await db
    .select()
    .from(athletes)
    .where(eq(athletes.authEmail, user.email.toLowerCase()))
    .limit(1);
  if (existing) return existing;

  const name = (user.fullName ?? user.displayName).toLowerCase();
  const inferredId = /\bthomas\b/.test(name)
    ? "thomas"
    : /\bkatie\b|\bkate\b|\bkt\b/.test(name)
      ? "kt"
      : null;

  if (!inferredId) return null;

  const [available] = await db
    .select()
    .from(athletes)
    .where(and(eq(athletes.id, inferredId), isNull(athletes.authEmail)))
    .limit(1);
  if (!available) return null;

  const [claimed] = await db
    .update(athletes)
    .set({ authEmail: user.email.toLowerCase(), updatedAt: nowIso() })
    .where(and(eq(athletes.id, inferredId), isNull(athletes.authEmail)))
    .returning();
  return claimed ?? null;
}

async function requireActor(db: TrainingDb, user: ChatGPTUser) {
  const actor = await resolveAthlete(db, user);
  return actor;
}

async function createActivity(
  db: TrainingDb,
  athleteId: string,
  activityType: string,
  message: string,
  entityId = "",
  metadata: Record<string, unknown> = {},
) {
  const id = crypto.randomUUID();
  await db.insert(activityFeedItems).values({
    id,
    teamId: TEAM_ID,
    athleteId,
    activityType,
    message,
    entityId,
    metadataJson: JSON.stringify(metadata),
    createdAt: nowIso(),
  });
  return id;
}

async function recordPlanHistory(
  db: TrainingDb,
  input: {
    weekId: string;
    athleteId: string;
    eventType: string;
    message: string;
    before?: unknown;
    after?: unknown;
  },
) {
  const id = crypto.randomUUID();
  await db.insert(planHistoryItems).values({
    id,
    weekId: input.weekId,
    athleteId: input.athleteId,
    eventType: input.eventType,
    message: input.message,
    beforeJson: JSON.stringify(input.before ?? {}),
    afterJson: JSON.stringify(input.after ?? {}),
    createdAt: nowIso(),
  });
  return id;
}

function workoutKindFor(family: string, category: string) {
  if (category === "strength") return "custom-strength";
  if (category === "recovery") return "rest";
  if (family === "hyrox") return "hyrox";
  if (category === "easy") return "easy";
  return "run-quality";
}

function workoutSessionFields(workout: typeof workoutLibraryItems.$inferSelect) {
  return {
    title: workout.name,
    category: workout.category,
    workoutKind: workoutKindFor(workout.family, workout.category),
    details: workout.prescription,
    workoutTemplateId: workout.id,
  };
}

function restorableSessionFields(value: Record<string, unknown>) {
  return {
    scheduledDate: asString(value.scheduledDate),
    title: asString(value.title),
    category: asString(value.category),
    workoutKind: asString(value.workoutKind),
    details: asString(value.details),
    workoutTemplateId:
      typeof value.workoutTemplateId === "string" ? value.workoutTemplateId : null,
    assignment: asString(value.assignment, "individual"),
    status: asString(value.status, "planned"),
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
    sortOrder: Math.round(asNumber(value.sortOrder, 0) ?? 0),
    updatedAt: nowIso(),
  };
}

function chooseWeek<
  T extends { id: string; startDate: string },
>(weeks: T[], requestedWeekId?: string | null) {
  if (requestedWeekId) {
    const requested = weeks.find((week) => week.id === requestedWeekId);
    if (requested) return requested;
  }

  const today = todayIso();
  const containing = weeks.find(
    (week) => week.startDate <= today && addDays(week.startDate, 6) >= today,
  );
  if (containing) return containing;
  return weeks.find((week) => week.startDate >= today) ?? weeks.at(-1) ?? null;
}

async function loadAppData(
  db: TrainingDb,
  actor: Athlete,
  requestedWeekId?: string | null,
) {
  const [
    athleteRows,
    blockRows,
    weekRows,
    eventRows,
    phaseRows,
    allLibraryRows,
    favouriteRows,
    exerciseSettingRows,
  ] =
    await Promise.all([
      db.select().from(athletes).orderBy(asc(athletes.displayName)),
      db.select().from(trainingBlocks).orderBy(asc(trainingBlocks.startDate)),
      db.select().from(plannedWeeks).orderBy(asc(plannedWeeks.startDate)),
      db.select().from(events).orderBy(asc(events.eventDate)),
      db.select().from(trainingPhases).orderBy(asc(trainingPhases.sortOrder)),
      db.select().from(workoutLibraryItems).orderBy(asc(workoutLibraryItems.family), asc(workoutLibraryItems.name)),
      db.select().from(workoutFavourites).where(eq(workoutFavourites.athleteId, actor.id)),
      db.select().from(athleteExerciseSettings),
    ]);

  const week = chooseWeek(weekRows, requestedWeekId);
  if (!week) throw new Error("No planned week is available.");

  const [focusRowsV2, catalogueRowsV2, locationRowsV2, equipmentRowsV2, currentLocationRowsV2, priorityRowsV2, builderTemplateRowsV2, builderSlotRowsV2, trackRowsV2, trackStepRowsV2, trackStateRowsV2, weekTypeRowsV2, weekIntentRowsV2, recommendationRowsV2, workoutCoverageRowsV2] = await Promise.all([
    db.select().from(trainingFocuses).where(eq(trainingFocuses.active, true)).orderBy(asc(trainingFocuses.name)),
    db.select().from(catalogueExercises).where(eq(catalogueExercises.active, true)).orderBy(asc(catalogueExercises.trainingFocus), asc(catalogueExercises.focusRank)),
    db.select().from(trainingLocations).where(eq(trainingLocations.active, true)).orderBy(asc(trainingLocations.name)),
    db.select().from(locationEquipment),
    db.select().from(athleteCurrentLocations),
    db.select().from(athleteHyroxPriorities).orderBy(asc(athleteHyroxPriorities.rank)),
    db.select().from(strengthTemplates).where(eq(strengthTemplates.active, true)).orderBy(asc(strengthTemplates.name)),
    db.select().from(strengthFocusSlots).orderBy(asc(strengthFocusSlots.sortOrder)),
    db.select().from(progressionTracks).where(eq(progressionTracks.active, true)).orderBy(asc(progressionTracks.name)),
    db.select().from(progressionSteps).orderBy(asc(progressionSteps.sortOrder)),
    db.select().from(progressionStatesV2),
    db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.active, true)).orderBy(asc(weekTypeTemplates.name)),
    db.select().from(weekTypeDayIntents).orderBy(asc(weekTypeDayIntents.day)),
    db.select().from(programmeWeekRecommendations),
    db.select().from(workoutHyroxCoverage),
  ]);

  const [sessionRows, originalRows, allSessionRows, feedRows, recentRows, historyRows] =
    await Promise.all([
      db
        .select({
          id: athleteSessions.id,
          weekId: athleteSessions.weekId,
          sharedSessionId: athleteSessions.sharedSessionId,
          athleteId: athleteSessions.athleteId,
          scheduledDate: athleteSessions.scheduledDate,
          title: athleteSessions.title,
          category: athleteSessions.category,
          workoutKind: athleteSessions.workoutKind,
          details: athleteSessions.details,
          workoutTemplateId: athleteSessions.workoutTemplateId,
          locationId: athleteSessions.locationId,
          assignment: athleteSessions.assignment,
          status: athleteSessions.status,
          completedAt: athleteSessions.completedAt,
          sortOrder: athleteSessions.sortOrder,
          resultId: workoutResults.id,
          rpe: workoutResults.rpe,
          feel: workoutResults.feel,
          averagePace: workoutResults.averagePace,
          totalTime: workoutResults.totalTime,
          distance: workoutResults.distance,
          rounds: workoutResults.rounds,
          reps: workoutResults.reps,
          calories: workoutResults.calories,
          customValue: workoutResults.customValue,
          notes: workoutResults.notes,
        })
        .from(athleteSessions)
        .leftJoin(workoutResults, eq(workoutResults.sessionId, athleteSessions.id))
        .where(eq(athleteSessions.weekId, week.id))
        .orderBy(asc(athleteSessions.scheduledDate), asc(athleteSessions.sortOrder)),
      db
        .select()
        .from(sharedSessions)
        .where(eq(sharedSessions.weekId, week.id))
        .orderBy(asc(sharedSessions.scheduledDate), asc(sharedSessions.sortOrder)),
      db
        .select({
          id: athleteSessions.id,
          weekId: athleteSessions.weekId,
          athleteId: athleteSessions.athleteId,
          scheduledDate: athleteSessions.scheduledDate,
          category: athleteSessions.category,
          status: athleteSessions.status,
        })
        .from(athleteSessions),
      db
        .select({
          id: activityFeedItems.id,
          athleteId: activityFeedItems.athleteId,
          athleteName: athletes.displayName,
          activityType: activityFeedItems.activityType,
          message: activityFeedItems.message,
          entityId: activityFeedItems.entityId,
          metadataJson: activityFeedItems.metadataJson,
          createdAt: activityFeedItems.createdAt,
        })
        .from(activityFeedItems)
        .innerJoin(athletes, eq(activityFeedItems.athleteId, athletes.id))
        .where(eq(activityFeedItems.teamId, TEAM_ID))
        .orderBy(desc(activityFeedItems.createdAt))
        .limit(40),
      db
        .select({
          id: athleteSessions.id,
          athleteId: athleteSessions.athleteId,
          title: athleteSessions.title,
          category: athleteSessions.category,
          workoutTemplateId: athleteSessions.workoutTemplateId,
          completedAt: athleteSessions.completedAt,
          rpe: workoutResults.rpe,
          feel: workoutResults.feel,
          averagePace: workoutResults.averagePace,
          totalTime: workoutResults.totalTime,
          distance: workoutResults.distance,
          rounds: workoutResults.rounds,
          reps: workoutResults.reps,
          calories: workoutResults.calories,
          customValue: workoutResults.customValue,
        })
        .from(athleteSessions)
        .leftJoin(workoutResults, eq(workoutResults.sessionId, athleteSessions.id))
        .where(eq(athleteSessions.status, "completed"))
        .orderBy(desc(athleteSessions.completedAt))
        .limit(30),
      db
        .select({
          id: planHistoryItems.id,
          weekId: planHistoryItems.weekId,
          athleteId: planHistoryItems.athleteId,
          athleteName: athletes.displayName,
          eventType: planHistoryItems.eventType,
          message: planHistoryItems.message,
          createdAt: planHistoryItems.createdAt,
          undoneAt: planHistoryItems.undoneAt,
        })
        .from(planHistoryItems)
        .innerJoin(athletes, eq(planHistoryItems.athleteId, athletes.id))
        .where(eq(planHistoryItems.weekId, week.id))
        .orderBy(desc(planHistoryItems.createdAt))
        .limit(40),
    ]);

  const reactionRows = feedRows.length
    ? await db
        .select()
        .from(reactions)
        .where(inArray(reactions.activityId, feedRows.map((item) => item.id)))
    : [];

  const feed = feedRows.map((item) => ({
    ...item,
    metadata: parseJson<Record<string, unknown>>(item.metadataJson, {}),
    reactions: reactionRows
      .filter((reaction) => reaction.activityId === item.id)
      .map((reaction) => ({
        athleteId: reaction.athleteId,
        emoji: reaction.emoji,
      })),
  }));

  const [slotRows, alternativeRows, performanceRows, setRows, stateRows, reviewRows, exerciseRows] =
    await Promise.all([
      db.select().from(strengthSlots).orderBy(asc(strengthSlots.workoutKind), asc(strengthSlots.sortOrder)),
      db
        .select({
          slotId: slotAlternatives.slotId,
          exerciseId: exercises.id,
          name: exercises.name,
          trainingGoal: exercises.trainingGoal,
          defaultIncrementKg: exercises.defaultIncrementKg,
          loadConvention: exercises.loadConvention,
          isAccessory: exercises.isAccessory,
          hyroxCarryoverJson: exercises.hyroxCarryoverJson,
        })
        .from(slotAlternatives)
        .innerJoin(exercises, eq(slotAlternatives.exerciseId, exercises.id)),
      db
        .select({
          id: exercisePerformances.id,
          resultId: exercisePerformances.resultId,
          athleteId: exercisePerformances.athleteId,
          exerciseId: exercisePerformances.exerciseId,
          exerciseName: exercises.name,
          slotId: exercisePerformances.slotId,
          workingLoadKg: exercisePerformances.workingLoadKg,
          note: exercisePerformances.note,
          performedAt: exercisePerformances.performedAt,
        })
        .from(exercisePerformances)
        .innerJoin(exercises, eq(exercisePerformances.exerciseId, exercises.id))
        .orderBy(desc(exercisePerformances.performedAt))
        .limit(240),
      db.select().from(strengthSets).orderBy(asc(strengthSets.setNumber)),
      db
        .select({
          athleteId: progressionStates.athleteId,
          exerciseId: progressionStates.exerciseId,
          exerciseName: exercises.name,
          currentLoadKg: progressionStates.currentLoadKg,
          recommendedLoadKg: progressionStates.recommendedLoadKg,
          lastPerformanceId: progressionStates.lastPerformanceId,
          updatedAt: progressionStates.updatedAt,
        })
        .from(progressionStates)
        .innerJoin(exercises, eq(progressionStates.exerciseId, exercises.id)),
      db.select().from(raceReviews).orderBy(desc(raceReviews.updatedAt)),
      db.select().from(exercises).orderBy(asc(exercises.name)),
    ]);

  const exerciseById = new Map(exerciseRows.map((exercise) => [exercise.id, exercise]));
  const settingFor = (athleteId: string, exerciseId: string) =>
    exerciseSettingRows.find(
      (setting) => setting.athleteId === athleteId && setting.exerciseId === exerciseId,
    );
  const exerciseNameFor = (athleteId: string, exerciseId: string, fallback: string) =>
    settingFor(athleteId, exerciseId)?.preferredName || fallback;

  const history = performanceRows.map((performance) => ({
    ...performance,
    exerciseName: exerciseNameFor(
      performance.athleteId,
      performance.exerciseId,
      performance.exerciseName,
    ),
    sets: setRows
      .filter((set) => set.performanceId === performance.id)
      .map((set) => ({
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
      })),
  }));

  const progressByAthlete = Object.fromEntries(
    athleteRows.map((athlete) => {
      const states = stateRows
        .filter((state) => state.athleteId === athlete.id)
        .map((state) => {
          const exercise = exerciseById.get(state.exerciseId);
          const setting = settingFor(athlete.id, state.exerciseId);
          const relatedSlotIds = alternativeRows
            .filter((option) => option.exerciseId === state.exerciseId)
            .map((option) => option.slotId);
          const alternativeIds = [
            ...new Set(
              alternativeRows
                .filter((option) => relatedSlotIds.includes(option.slotId))
                .map((option) => option.exerciseId),
            ),
          ];
          return {
            ...state,
            exerciseName: exerciseNameFor(athlete.id, state.exerciseId, state.exerciseName),
            preferredName: setting?.preferredName ?? "",
            loadConvention: setting?.loadConvention ?? exercise?.loadConvention ?? "total_load",
            loadIncrementKg:
              setting?.loadIncrementKg ?? exercise?.defaultIncrementKg ?? athlete.loadIncrementKg,
            approvedAlternativeIds: parseJson<string[]>(
              setting?.approvedAlternativesJson ?? "[]",
              [],
            ),
            defaultAlternativeId: setting?.defaultAlternativeId ?? null,
            notes: setting?.notes ?? "",
            alternatives: alternativeIds.map((id) => ({
              id,
              name: exerciseNameFor(athlete.id, id, exerciseById.get(id)?.name ?? id),
            })),
            history: history
              .filter(
                (entry) =>
                  entry.athleteId === athlete.id &&
                  entry.exerciseId === state.exerciseId,
              )
              .slice(0, 8),
          };
        });
      return [athlete.id, states];
    }),
  );

  const strengthDefinitions = ["strength-a", "strength-b"].map((workoutKind) => ({
    workoutKind,
    label: workoutKind === "strength-a" ? "Strength A" : "Strength B",
    slots: slotRows
      .filter((slot) => slot.workoutKind === workoutKind && !slot.id.startsWith("v2-"))
      .map((slot) => {
        const baseSetting = settingFor(actor.id, slot.defaultExerciseId);
        const approved = parseJson<string[]>(baseSetting?.approvedAlternativesJson ?? "[]", []);
        const rawOptions = alternativeRows.filter((option) => option.slotId === slot.id && !(slot.id === "a-hamstrings" && /\brdl\b|romanian deadlift|hip hinge/i.test(option.name)));
        const visibleOptions = approved.length
          ? rawOptions.filter(
              (option) =>
                option.exerciseId === slot.defaultExerciseId || approved.includes(option.exerciseId),
            )
          : rawOptions;
        const options = visibleOptions.map((option) => {
          const setting = settingFor(actor.id, option.exerciseId);
          return {
            ...option,
            baseName: option.name,
            name: setting?.preferredName || option.name,
            defaultIncrementKg:
              setting?.loadIncrementKg ?? option.defaultIncrementKg ?? actor.loadIncrementKg,
            loadConvention: setting?.loadConvention ?? option.loadConvention ?? "total_load",
            hyroxCarryover: parseJson<string[]>(option.hyroxCarryoverJson ?? "[]", []),
          };
        });
        const lastUsed = history.find(
          (entry) => entry.athleteId === actor.id && entry.slotId === slot.id,
        );
        const preferredDefault = baseSetting?.defaultAlternativeId;
        const selectedExerciseId =
          lastUsed?.exerciseId ??
          (preferredDefault && options.some((option) => option.exerciseId === preferredDefault)
            ? preferredDefault
            : slot.defaultExerciseId);
        return {
          ...slot,
          selectedExerciseId,
          options,
        };
      }),
  }));

  const favouriteIds = new Set(favouriteRows.map((item) => item.workoutId));
  const recentTemplateIds = new Set(
    recentRows
      .filter((item) => item.athleteId === actor.id && item.workoutTemplateId)
      .map((item) => item.workoutTemplateId as string),
  );
  const libraryById = new Map(
    allLibraryRows.map((item) => [
      item.id,
      {
        ...item,
        favourite: favouriteIds.has(item.id),
        isRecent: recentTemplateIds.has(item.id),
        canEdit: !item.isBuiltIn && item.ownerAthleteId === actor.id,
      },
    ]),
  );
  const workoutLibrary = [...libraryById.values()].filter((item) => !item.deletedAt);
  const clientSessionRows = week.confirmedAt
    ? sessionRows
    : sessionRows.filter((session) => session.status === "completed");
  const sessions = clientSessionRows.map((session) => {
    const workoutTemplateId =
      session.workoutTemplateId ??
      workoutTemplateIdForSession(session.title, session.workoutKind);
    return {
      ...session,
      workoutTemplateId,
      workout: workoutTemplateId ? libraryById.get(workoutTemplateId) ?? null : null,
    };
  });
  const originalPlan = originalRows.filter((session) => session.sortOrder < 90).map((session) => ({
    ...session,
    workoutTemplateId:
      session.workoutTemplateId ??
      workoutTemplateIdForSession(session.title, session.workoutKind),
  }));

  const totals = Object.fromEntries(
    athleteRows.map((athlete) => [athlete.id, categoryTotals(clientSessionRows, athlete.id)]),
  );

  const consistency = Object.fromEntries(
    athleteRows.map((athlete) => [
      athlete.id,
      weekRows.filter((item) => Boolean(item.confirmedAt)).map((item) => ({
        weekId: item.id,
        startDate: item.startDate,
        title: item.title,
        targets: {
          hard: item.hardTarget,
          strength: item.strengthTarget,
          easy: item.easyTarget,
        },
        ...categoryTotals(allSessionRows.filter((row) => row.weekId === item.id), athlete.id),
      })),
    ]),
  );

  const selectedBlock = blockRows.find((block) => block.id === week.blockId) ?? blockRows[0];
  const phase = phaseRows.find(
    (item) =>
      item.blockId === week.blockId &&
      item.startDate <= week.startDate &&
      item.endDate >= week.startDate,
  );
  const today = todayIso();
  const weeksWithState = weekRows.map((item) => ({
    ...item,
    planningState: planningStateFor(
      item,
      allSessionRows.filter((row) => row.weekId === item.id),
      today,
    ),
  }));
  const baseWeekWithState = weeksWithState.find((item) => item.id === week.id) ?? {
    ...week,
    planningState: planningStateFor(week, sessionRows, today),
  };
  const weekRecommendation = recommendationRowsV2.find((item) => item.weekId === week.id);
  const weekWithState = !baseWeekWithState.confirmedAt && weekRecommendation
    ? { ...baseWeekWithState, title: weekRecommendation.title || baseWeekWithState.title, rationale: weekRecommendation.rationale || baseWeekWithState.rationale, qualityFocus: weekRecommendation.qualityIntent || baseWeekWithState.qualityFocus, programmeWeekTypeId: weekRecommendation.weekTypeId, programmePhaseId: weekRecommendation.phaseId }
    : baseWeekWithState;
  const eventData = eventRows.map((event) => ({
    ...event,
    daysAway: daysBetween(today, event.eventDate),
  }));
  const partner = athleteRows.find((athlete) => athlete.id !== actor.id) ?? null;

  const v2 = {
    trainingFocuses: focusRowsV2.map((focus) => ({
      id: focus.id,
      name: focus.name,
      purpose: focus.purpose,
      defaultPrescription: focus.defaultPrescription,
      primaryMuscles: focus.primaryMuscles,
      hyroxLinks: parseJson<string[]>(focus.hyroxLinksJson, []),
      programmingNotes: focus.programmingNotes,
      isBuiltIn: focus.isBuiltIn,
      active: focus.active,
    })),
    catalogue: catalogueRowsV2.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      family: exercise.family,
      trainingFocus: exercise.trainingFocus,
      secondaryFocus: exercise.secondaryFocus,
      tier: exercise.tier,
      defaultVisibility: exercise.defaultVisibility,
      focusRank: exercise.focusRank,
      primaryEquipment: exercise.primaryEquipment,
      secondaryEquipment: exercise.secondaryEquipment ?? "",
      primaryMuscleGroup: exercise.primaryMuscleGroup,
      secondaryMuscleGroups: exercise.secondaryMuscleGroups ?? "",
      helpsWith: parseJson<string[]>(exercise.helpsWithJson, []),
      directHyrox: exercise.directHyrox,
      prescription: exercise.prescription,
      loadConvention: exercise.loadConvention,
      defaultIncrementKg: exercise.defaultIncrementKg,
      demoUrl: exercise.demoUrl,
      explanationUrl: exercise.explanationUrl,
      legacyExerciseId: exercise.legacyExerciseId,
      historyExerciseId: exercise.legacyExerciseId ?? `catalogue-${exercise.id}`,
    })),
    locations: locationRowsV2.map((location) => ({
      id: location.id,
      name: location.name,
      notes: location.notes,
      equipment: equipmentRowsV2.filter((item) => item.locationId === location.id).map((item) => item.equipment),
      active: location.active,
    })),
    currentLocationId: currentLocationRowsV2.find((item) => item.athleteId === actor.id)?.locationId ?? null,
    priorities: Object.fromEntries(athleteRows.map((athlete) => [athlete.id, priorityRowsV2.filter((item) => item.athleteId === athlete.id).sort((a, b) => a.rank - b.rank).map((item) => item.station)])),
    strengthTemplates: builderTemplateRowsV2.map((template) => ({
      id: template.id,
      name: template.name,
      purpose: template.purpose,
      isBuiltIn: template.isBuiltIn,
      slots: builderSlotRowsV2.filter((slot) => slot.templateId === template.id).map((slot) => ({
        id: slot.id,
        templateId: slot.templateId,
        focusId: slot.focusId,
        historySlotId: slot.historySlotId,
        focusName: focusRowsV2.find((focus) => focus.id === slot.focusId)?.name ?? slot.focusId,
        exerciseId: slot.exerciseId,
        historyExerciseId: slot.exerciseId ? catalogueRowsV2.find((exercise) => exercise.id === slot.exerciseId)?.legacyExerciseId ?? `catalogue-${slot.exerciseId}` : null,
        exerciseName: slot.exerciseId ? catalogueRowsV2.find((exercise) => exercise.id === slot.exerciseId)?.name ?? null : null,
        prescription: slot.prescription,
        sortOrder: slot.sortOrder,
        notes: slot.notes,
      })),
    })),
    progressionTracks: trackRowsV2.map((track) => ({
      id: track.id,
      name: track.name,
      purpose: track.purpose,
      isBuiltIn: track.isBuiltIn,
      currentStep: trackStateRowsV2.find((state) => state.trackId === track.id && state.athleteId === actor.id)?.currentStep ?? 0,
      togetherPending: trackStateRowsV2.some((state) => state.trackId === track.id && state.togetherPending),
      steps: trackStepRowsV2.filter((step) => step.trackId === track.id).sort((a, b) => a.sortOrder - b.sortOrder),
    })),
    weekTypeTemplates: weekTypeRowsV2.map((template) => ({ ...template, intents: weekIntentRowsV2.filter((intent) => intent.weekTypeId === template.id).sort((a, b) => a.day - b.day) })),
    programmeRecommendations: recommendationRowsV2,
    workoutCoverage: Object.fromEntries(allLibraryRows.map((workout) => [workout.id, workoutCoverageRowsV2.filter((row) => row.workoutId === workout.id).map((row) => ({ station: row.station, exposure: row.exposure === "supporting" ? "supporting" as const : "direct" as const }))])),
  };

  return {
    actor: {
      id: actor.id,
      athleteKey: actor.athleteKey,
      displayName: actor.displayName,
      units: actor.units,
      loadIncrementKg: actor.loadIncrementKg,
      preferredDays: parseJson<string[]>(actor.preferredDaysJson, []),
      titleBarColor: actor.titleBarColor,
    },
    partner: partner
      ? {
          id: partner.id,
          athleteKey: partner.athleteKey,
          displayName: partner.displayName,
        }
      : null,
    athletes: athleteRows.map((athlete) => ({
      id: athlete.id,
      displayName: athlete.displayName,
      claimed: Boolean(athlete.authEmail),
    })),
    block: selectedBlock,
    blocks: blockRows,
    phase: phase ?? null,
    phases: phaseRows.filter((item) => item.blockId === selectedBlock?.id),
    events: eventData,
    weeks: weeksWithState,
    week: weekWithState,
    originalPlan,
    sessions,
    totals,
    consistency,
    feed,
    workoutLibrary,
    planHistory: historyRows,
    strengthDefinitions,
    exerciseHistory: history,
    progress: progressByAthlete,
    recentSessions: recentRows,
    raceReviews: reviewRows.map((review) => ({
      ...review,
      stationTimes: parseJson<Record<string, string>>(review.stationTimesJson, {}),
      reflection: parseJson<Record<string, string>>(review.reflectionJson, {}),
    })),
    weekTypes: WEEK_TYPE_INFO,
    serverDate: today,
    coachAvailable: false,
    v2,
  };
}

export async function GET(request: Request) {
  const user = await currentIdentity();
  if (!user) return apiError("Sign in with ChatGPT to continue.", 401);

  try {
    const db = getDb();
    await ensureSeeded(db);
    const actor = await resolveAthlete(db, user);
    if (!actor) {
      const available = await db
        .select({ id: athletes.id, displayName: athletes.displayName })
        .from(athletes)
        .where(isNull(athletes.authEmail));
      return Response.json({
        needsProfileClaim: true,
        authenticatedName: user.displayName,
        availableProfiles: available,
      });
    }

    const url = new URL(request.url);
    const data = await loadAppData(db, actor, url.searchParams.get("weekId"));
    return Response.json({ needsProfileClaim: false, ...data });
  } catch (error) {
    console.error("Unable to load training data", error);
    return apiError("Training data could not load. Please try again.", 500);
  }
}

export async function POST(request: Request) {
  const user = await currentIdentity();
  if (!user) return apiError("Sign in with ChatGPT to continue.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("A valid JSON request is required.");
  }

  try {
    const db = getDb();
    await ensureSeeded(db);
    const action = asString(body.action);

    if (action === "claimProfile") {
      const profileId = asString(body.profileId);
      if (!new Set(["thomas", "kt"]).has(profileId)) {
        return apiError("Choose an available athlete profile.");
      }
      const alreadyClaimed = await resolveAthlete(db, user);
      if (alreadyClaimed) {
        return Response.json({ ok: true, athleteId: alreadyClaimed.id });
      }
      const [claimed] = await db
        .update(athletes)
        .set({ authEmail: user.email.toLowerCase(), updatedAt: nowIso() })
        .where(and(eq(athletes.id, profileId), isNull(athletes.authEmail)))
        .returning();
      if (!claimed) return apiError("That profile has already been linked to another sign-in.", 409);
      await createActivity(
        db,
        claimed.id,
        "profile",
        `${claimed.displayName} securely linked their ChatGPT sign-in.`,
        claimed.id,
      );
      return Response.json({ ok: true, athleteId: claimed.id });
    }

    const actor = await requireActor(db, user);
    if (!actor) return apiError("Your sign-in has not been linked to Thomas or KT.", 403);

    if (action === "factoryResetTrainingData") {
      // This endpoint is deliberately explicit and authenticated: it is never
      // called by initialization or deployment, only by the Settings danger
      // zone after the client-side two-step hold confirmation.
      await resetTrainingData(db);
      return Response.json({ ok: true, reset: true });
    }

    if (action === "confirmWeek") {
      const weekId = asString(body.weekId);
      const [week] = await db.select().from(plannedWeeks).where(eq(plannedWeeks.id, weekId)).limit(1);
      if (!week) return apiError("Week not found.", 404);
      const recommendation = await db.select().from(programmeWeekRecommendations).where(eq(programmeWeekRecommendations.weekId, weekId)).limit(1).then((rows) => rows[0]);
      const programmeIntents = await db.select().from(programmeWeekDayIntents).where(eq(programmeWeekDayIntents.weekId, weekId)).orderBy(asc(programmeWeekDayIntents.day));
      const baseIntents = programmeIntents.length
        ? programmeIntents
        : recommendation?.weekTypeId
          ? await db.select().from(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, recommendation.weekTypeId)).orderBy(asc(weekTypeDayIntents.day))
          : [];
      // The programme recommendation owns one explicitly marked quality
      // intent. Materialisation must not reinterpret every hard session as
      // the same running progression.
      const intents = recommendation?.progressionTrackId
        ? baseIntents.map((intent) => (intent as { isQualityIntent?: boolean }).isQualityIntent ? { ...intent, progressionTrackId: recommendation.progressionTrackId } : intent)
        : baseIntents;
      const weekType = recommendation?.weekTypeId ? await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, recommendation.weekTypeId)).limit(1).then((rows) => rows[0]) : null;
      const materializedSessions = recommendation?.weekTypeId && intents.length
        ? await reconcileV2RecommendedWeek(db, week, intents, true, { defaultLocationId: weekType?.defaultLocationId ?? null, sharedProgression: true })
        : await reconcileRecommendedWeek(db, week, true);
      const confirmedAt = nowIso();
      await db
        .update(plannedWeeks)
        .set({ confirmedAt, status: "set", programmeWeekTypeId: recommendation?.weekTypeId ?? week.programmeWeekTypeId, programmePhaseId: recommendation?.phaseId ?? week.programmePhaseId, programmeSnapshotJson: JSON.stringify({ recommendation: recommendation ?? null, intents, materializedSessions, capturedAt: confirmedAt }) , updatedAt: confirmedAt })
        .where(eq(plannedWeeks.id, weekId));
      await recordPlanHistory(db, {
        weekId,
        athleteId: actor.id,
        eventType: "shared_set",
        message: "Shared week set",
        before: { confirmedAt: week.confirmedAt, status: week.status },
        after: { confirmedAt, status: "set" },
      });
      await createActivity(db, actor.id, "plan", `${actor.displayName} set the shared ${week.title}.`, weekId);
      return Response.json({ ok: true });
    }

    if (action === "setWeekType") {
      const weekId = asString(body.weekId);
      const weekType = asString(body.weekType);
      const [v2Template] = await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, `week-type-${weekType}`)).limit(1);
      const info = WEEK_TYPE_INFO[weekType] ?? (v2Template ? { label: v2Template.name, rationale: v2Template.rationale, targets: { hard: v2Template.hardTarget, strength: v2Template.strengthTarget, easy: v2Template.easyTarget } } : null);
      if (!info) return apiError("Choose a valid week type.");
      const [week] = await db.select().from(plannedWeeks).where(eq(plannedWeeks.id, weekId)).limit(1);
      if (!week) return apiError("Week not found.", 404);
      if (week.confirmedAt) return apiError("This shared week is already set. Edit sessions individually or for both instead.", 409);

      const hardTarget = Math.max(0, Math.round(asNumber(body.hardTarget, info.targets.hard) ?? info.targets.hard));
      const strengthTarget = Math.max(0, Math.round(asNumber(body.strengthTarget, info.targets.strength) ?? info.targets.strength));
      const easyTarget = Math.max(0, Math.round(asNumber(body.easyTarget, info.targets.easy) ?? info.targets.easy));
      const updated = {
        ...week,
        title: info.label,
        weekType,
        rationale: info.rationale,
        hardTarget,
        strengthTarget,
        easyTarget,
        confirmedAt: null,
        status: "recommended",
        updatedAt: nowIso(),
      };
      await db.update(plannedWeeks).set(updated).where(eq(plannedWeeks.id, weekId));
      await rebuildWeekSessions(db, updated);
      if (v2Template) {
        await setProgrammeWeekType(db, weekId, v2Template.id);
      }
      await createActivity(db, actor.id, "plan", `${actor.displayName} selected ${info.label}.`, weekId);
      return Response.json({ ok: true });
    }

    if (action === "updateWeeklyTargets") {
      const weekId = asString(body.weekId);
      const [week] = await db
        .select()
        .from(plannedWeeks)
        .where(eq(plannedWeeks.id, weekId))
        .limit(1);
      if (!week) return apiError("Week not found.", 404);
      const next = {
        hardTarget: Math.max(0, Math.round(asNumber(body.hardTarget, week.hardTarget) ?? week.hardTarget)),
        strengthTarget: Math.max(0, Math.round(asNumber(body.strengthTarget, week.strengthTarget) ?? week.strengthTarget)),
        easyTarget: Math.max(0, Math.round(asNumber(body.easyTarget, week.easyTarget) ?? week.easyTarget)),
      };
      const changes = [
        ["Hard Conditioning", week.hardTarget, next.hardTarget],
        ["Strength", week.strengthTarget, next.strengthTarget],
        ["Easy Aerobic", week.easyTarget, next.easyTarget],
      ].filter(([, before, after]) => before !== after) as Array<[string, number, number]>;
      if (!changes.length) return Response.json({ ok: true });
      await db
        .update(plannedWeeks)
        .set({ ...next, updatedAt: nowIso() })
        .where(eq(plannedWeeks.id, weekId));
      for (const [label, before, after] of changes) {
        const message = `${label} target changed from ${before} → ${after}`;
        await recordPlanHistory(db, {
          weekId,
          athleteId: actor.id,
          eventType: "target",
          message,
          before: { hardTarget: week.hardTarget, strengthTarget: week.strengthTarget, easyTarget: week.easyTarget },
          after: next,
        });
        await createActivity(db, actor.id, "plan", message, weekId, { positive: true });
      }
      return Response.json({ ok: true });
    }

    if (action === "changeSession") {
      const sessionId = asString(body.sessionId);
      const scope = asString(body.scope, "me");
      const [current] = await db
        .select()
        .from(athleteSessions)
        .where(and(eq(athleteSessions.id, sessionId), eq(athleteSessions.athleteId, actor.id)))
        .limit(1);
      if (!current) return apiError("Session not found.", 404);
      if (current.status === "completed") return apiError("Completed sessions are preserved and cannot be rescheduled.", 409);

      const scheduledDate = asString(body.scheduledDate, current.scheduledDate);
      const workoutId = asString(body.workoutId);
      const [replacement] = workoutId
        ? await db
            .select()
            .from(workoutLibraryItems)
            .where(and(eq(workoutLibraryItems.id, workoutId), isNull(workoutLibraryItems.deletedAt)))
            .limit(1)
        : [];
      if (workoutId && !replacement) return apiError("Workout template not found.", 404);
      const replacementFields = replacement ? workoutSessionFields(replacement) : null;
      const title = replacementFields?.title ?? asString(body.title, current.title);
      const category = replacementFields?.category ?? asString(body.category, current.category);
      const workoutKind = replacementFields?.workoutKind ?? asString(body.workoutKind, current.workoutKind);
      const details = replacementFields?.details ?? asString(body.details, current.details);
      const workoutTemplateId = replacementFields?.workoutTemplateId ?? current.workoutTemplateId;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return apiError("Choose a valid date.");
      if (!title) return apiError("Session title is required.");
      if (!validCategories.has(category)) return apiError("Choose a valid training category.");
      const [sessionWeek] = await db
        .select()
        .from(plannedWeeks)
        .where(eq(plannedWeeks.id, current.weekId))
        .limit(1);
      if (
        !sessionWeek ||
        !sessionWeek.confirmedAt ||
        scheduledDate < sessionWeek.startDate ||
        scheduledDate > addDays(sessionWeek.startDate, 6)
      ) {
        return apiError(!sessionWeek?.confirmedAt ? "Plan and set this week before changing sessions." : "Move the session to a date inside this training week.");
      }

      const changes = {
        scheduledDate,
        title,
        category,
        workoutKind,
        details,
        workoutTemplateId,
        // Moving a session preserves its explicit progression linkage.
        // Replacing it with another workout clears that linkage unless a
        // caller deliberately supplies the same linked step in a future flow.
        progressionTrackId: replacement ? null : current.progressionTrackId,
        progressionStepId: replacement ? null : current.progressionStepId,
        updatedAt: nowIso(),
      };
      const affectedBefore = scope === "both" && current.sharedSessionId
        ? await db
            .select()
            .from(athleteSessions)
            .where(
              and(
                eq(athleteSessions.sharedSessionId, current.sharedSessionId),
                eq(athleteSessions.status, "planned"),
              ),
            )
        : [current];
      if (scope === "both") {
        if (!current.sharedSessionId) return apiError("This individual session has no shared counterpart.");
        await db
          .update(athleteSessions)
          .set({ ...changes, assignment: "together" })
          .where(
            and(
              eq(athleteSessions.sharedSessionId, current.sharedSessionId),
              eq(athleteSessions.status, "planned"),
            ),
          );
      } else {
        await db
          .update(athleteSessions)
          .set({ ...changes, assignment: "individual" })
          .where(eq(athleteSessions.id, current.id));
      }
      const moved = scheduledDate !== current.scheduledDate;
      const replaced = title !== current.title;
      const message = replaced
        ? `${actor.displayName} changed ${current.title} → ${title}${scope === "both" ? " for both" : " in their plan"}.`
        : moved
          ? `${actor.displayName} moved ${current.title} to ${scheduledDate}${scope === "both" ? " for both" : " in their plan"}.`
          : `${actor.displayName} updated ${current.title}${scope === "both" ? " for both" : " in their plan"}.`;
      await createActivity(db, actor.id, "change", message, current.id, { scope });
      const affectedAfter = affectedBefore.length
        ? await db
            .select()
            .from(athleteSessions)
            .where(inArray(athleteSessions.id, affectedBefore.map((item) => item.id)))
        : [];
      const undoToken = await recordPlanHistory(db, {
        weekId: current.weekId,
        athleteId: actor.id,
        eventType: replaced ? "replace" : moved ? "move" : "update",
        message,
        before: { sessions: affectedBefore },
        after: { sessions: affectedAfter },
      });
      return Response.json({ ok: true, undoToken });
    }

    if (action === "removeSession") {
      const sessionId = asString(body.sessionId);
      const scope = asString(body.scope, "me");
      const [current] = await db
        .select()
        .from(athleteSessions)
        .where(and(eq(athleteSessions.id, sessionId), eq(athleteSessions.athleteId, actor.id)))
        .limit(1);
      if (!current) return apiError("Session not found.", 404);
      if (current.status === "completed") return apiError("Completed sessions are preserved and cannot be removed.", 409);
      const affectedBefore = scope === "both" && current.sharedSessionId
        ? await db
            .select()
            .from(athleteSessions)
            .where(
              and(
                eq(athleteSessions.sharedSessionId, current.sharedSessionId),
                eq(athleteSessions.status, "planned"),
              ),
            )
        : [current];
      if (scope === "both" && current.sharedSessionId) {
        await db
          .update(athleteSessions)
          .set({ status: "removed", updatedAt: nowIso() })
          .where(
            and(
              eq(athleteSessions.sharedSessionId, current.sharedSessionId),
              eq(athleteSessions.status, "planned"),
            ),
          );
      } else {
        await db
          .update(athleteSessions)
          .set({ status: "removed", assignment: "individual", updatedAt: nowIso() })
          .where(eq(athleteSessions.id, current.id));
      }
      const message = `${actor.displayName} removed ${current.title}${scope === "both" ? " for both" : " from their plan"}.`;
      await createActivity(db, actor.id, "change", message, current.id);
      const affectedAfter = affectedBefore.length
        ? await db
            .select()
            .from(athleteSessions)
            .where(inArray(athleteSessions.id, affectedBefore.map((item) => item.id)))
        : [];
      const undoToken = await recordPlanHistory(db, {
        weekId: current.weekId,
        athleteId: actor.id,
        eventType: "remove",
        message,
        before: { sessions: affectedBefore },
        after: { sessions: affectedAfter },
      });
      return Response.json({ ok: true, undoToken });
    }

    if (action === "addSession") {
      const weekId = asString(body.weekId);
      const scheduledDate = asString(body.scheduledDate);
      const workoutId = asString(body.workoutId);
      const [workout] = workoutId
        ? await db
            .select()
            .from(workoutLibraryItems)
            .where(and(eq(workoutLibraryItems.id, workoutId), isNull(workoutLibraryItems.deletedAt)))
            .limit(1)
        : [];
      if (workoutId && !workout) return apiError("Workout template not found.", 404);
      const workoutFields = workout ? workoutSessionFields(workout) : null;
      const title = workoutFields?.title ?? asString(body.title);
      const category = workoutFields?.category ?? asString(body.category);
      const workoutKind = workoutFields?.workoutKind ?? asString(body.workoutKind, category === "strength" ? "strength-a" : "custom");
      const details = workoutFields?.details ?? asString(body.details);
      const workoutTemplateId = workoutFields?.workoutTemplateId ?? null;
      const scope = asString(body.scope, "me");
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !validCategories.has(category)) {
        return apiError("Title, date and category are required.");
      }
      const [week] = await db.select().from(plannedWeeks).where(eq(plannedWeeks.id, weekId)).limit(1);
      if (!week) return apiError("Week not found.", 404);
      if (!week.confirmedAt) return apiError("Plan and set this week before adding sessions.", 409);
      if (scheduledDate < week.startDate || scheduledDate > addDays(week.startDate, 6)) {
        return apiError("Add the session to a date inside this training week.");
      }
      const sharedId = scope === "both" ? `shared-${crypto.randomUUID()}` : null;
      if (sharedId) {
        await db.insert(sharedSessions).values({
          id: sharedId,
          weekId,
          scheduledDate,
          title,
          category,
          workoutKind,
          details,
          workoutTemplateId,
          assignment: "together",
          sortOrder: 99,
        });
      }
      const athleteIds = scope === "both" ? ["thomas", "kt"] : [actor.id];
      const newSessionRows = athleteIds.map((athleteId) => ({
          id: `session-${crypto.randomUUID()}`,
          weekId,
          sharedSessionId: sharedId,
          athleteId,
          scheduledDate,
          title,
          category,
          workoutKind,
          details,
          workoutTemplateId,
          assignment: scope === "both" ? "together" : "individual",
          status: "planned",
          sortOrder: 99,
        }));
      await db.insert(athleteSessions).values(newSessionRows);
      const message = `${actor.displayName} added ${title}${scope === "both" ? " for both" : " to their plan"}.`;
      await createActivity(db, actor.id, "change", message, weekId);
      const undoToken = await recordPlanHistory(db, {
        weekId,
        athleteId: actor.id,
        eventType: "add",
        message,
        before: { sessions: [], sharedSessionIds: [] },
        after: { sessions: newSessionRows, sharedSessionIds: sharedId ? [sharedId] : [] },
      });
      return Response.json({ ok: true, undoToken });
    }

    if (action === "undoPlanChange") {
      const historyId = asString(body.historyId);
      const [historyItem] = await db
        .select()
        .from(planHistoryItems)
        .where(
          and(
            eq(planHistoryItems.id, historyId),
            eq(planHistoryItems.athleteId, actor.id),
            isNull(planHistoryItems.undoneAt),
          ),
        )
        .limit(1);
      if (!historyItem) return apiError("That plan change can no longer be undone.", 409);
      if (Date.now() - new Date(historyItem.createdAt).getTime() > 15 * 60_000) {
        return apiError("The Undo window has expired. Use a plan reset if needed.", 409);
      }
      const before = parseJson<{ sessions?: Array<Record<string, unknown>> }>(historyItem.beforeJson, {});
      const after = parseJson<{
        sessions?: Array<Record<string, unknown>>;
        sharedSessionIds?: string[];
      }>(historyItem.afterJson, {});

      if (historyItem.eventType === "add") {
        const sessionIds = (after.sessions ?? []).map((item) => asString(item.id)).filter(Boolean);
        if (sessionIds.length) {
          const currentRows = await db
            .select()
            .from(athleteSessions)
            .where(inArray(athleteSessions.id, sessionIds));
          if (currentRows.some((item) => item.status === "completed")) {
            return apiError("A completed session cannot be removed by Undo.", 409);
          }
          await db.delete(athleteSessions).where(inArray(athleteSessions.id, sessionIds));
        }
        const sharedIds = (after.sharedSessionIds ?? []).filter(Boolean);
        if (sharedIds.length) {
          await db.delete(sharedSessions).where(inArray(sharedSessions.id, sharedIds));
        }
      } else {
        for (const snapshot of before.sessions ?? []) {
          const id = asString(snapshot.id);
          if (!id) continue;
          const [current] = await db
            .select()
            .from(athleteSessions)
            .where(eq(athleteSessions.id, id))
            .limit(1);
          if (!current || current.status === "completed") continue;
          await db
            .update(athleteSessions)
            .set(restorableSessionFields(snapshot))
            .where(eq(athleteSessions.id, id));
        }
      }
      await db
        .update(planHistoryItems)
        .set({ undoneAt: nowIso() })
        .where(eq(planHistoryItems.id, historyId));
      return Response.json({ ok: true });
    }

    if (action === "resetPlan") {
      const weekId = asString(body.weekId);
      const scope = asString(body.scope, "me");
      const [week] = await db
        .select()
        .from(plannedWeeks)
        .where(eq(plannedWeeks.id, weekId))
        .limit(1);
      if (!week) return apiError("Week not found.", 404);
      const originalRows = (
        await db
          .select()
          .from(sharedSessions)
          .where(eq(sharedSessions.weekId, weekId))
          .orderBy(asc(sharedSessions.sortOrder))
      ).filter((item) => item.sortOrder < 90);
      const athleteIds = scope === "both" ? ["thomas", "kt"] : [actor.id];
      const beforeRows = await db
        .select()
        .from(athleteSessions)
        .where(
          and(
            eq(athleteSessions.weekId, weekId),
            inArray(athleteSessions.athleteId, athleteIds),
          ),
        );
      const preserved: string[] = [];
      for (const athleteId of athleteIds) {
        const athleteRows = beforeRows.filter((item) => item.athleteId === athleteId);
        for (const row of athleteRows) {
          if (row.status === "completed") {
            preserved.push(row.title);
            continue;
          }
          const original = row.sharedSessionId
            ? originalRows.find((item) => item.id === row.sharedSessionId)
            : null;
          if (!original) {
            await db
              .update(athleteSessions)
              .set({ status: "removed", assignment: "individual", updatedAt: nowIso() })
              .where(eq(athleteSessions.id, row.id));
            continue;
          }
          await db
            .update(athleteSessions)
            .set({
              scheduledDate: original.scheduledDate,
              title: original.title,
              category: original.category,
              workoutKind: original.workoutKind,
              details: original.details,
              workoutTemplateId:
                original.workoutTemplateId ??
                workoutTemplateIdForSession(original.title, original.workoutKind),
              assignment: "together",
              status: "planned",
              completedAt: null,
              sortOrder: original.sortOrder,
              updatedAt: nowIso(),
            })
            .where(eq(athleteSessions.id, row.id));
        }
      }
      const afterRows = await db
        .select()
        .from(athleteSessions)
        .where(
          and(
            eq(athleteSessions.weekId, weekId),
            inArray(athleteSessions.athleteId, athleteIds),
          ),
        );
      const message = scope === "both"
        ? `${actor.displayName} reset both plans to the original shared week.`
        : `${actor.displayName} reset their plan to the shared week.`;
      await recordPlanHistory(db, {
        weekId,
        athleteId: actor.id,
        eventType: scope === "both" ? "reset_both" : "reset_me",
        message,
        before: { sessions: beforeRows },
        after: { sessions: afterRows, preserved },
      });
      await createActivity(db, actor.id, "change", message, weekId, {
        preservedCompletedSessions: [...new Set(preserved)],
      });
      return Response.json({
        ok: true,
        preservedCompletedSessions: [...new Set(preserved)],
      });
    }

    if (action === "unsetWeek") {
      const weekId = asString(body.weekId);
      const [week] = await db
        .select()
        .from(plannedWeeks)
        .where(eq(plannedWeeks.id, weekId))
        .limit(1);
      if (!week) return apiError("Week not found.", 404);
      if (!week.confirmedAt) return Response.json({ ok: true, preservedCompletedCount: 0 });

      const beforeRows = await db
        .select()
        .from(athleteSessions)
        .where(eq(athleteSessions.weekId, weekId));
      const preservedCompleted = await unsetWeekPlanningState(db, week);
      const defaults = WEEK_TYPE_INFO[week.weekType]?.targets ?? {
        hard: week.hardTarget,
        strength: week.strengthTarget,
        easy: week.easyTarget,
      };
      const message = "Shared week unset";
      await recordPlanHistory(db, {
        weekId,
        athleteId: actor.id,
        eventType: "shared_unset",
        message,
        before: {
          confirmedAt: week.confirmedAt,
          status: week.status,
          targets: {
            hard: week.hardTarget,
            strength: week.strengthTarget,
            easy: week.easyTarget,
          },
          sessions: beforeRows,
        },
        after: {
          confirmedAt: null,
          status: "recommended",
          recommendedTargets: defaults,
          preservedCompletedSessionIds: preservedCompleted.map((item) => item.id),
        },
      });
      await createActivity(
        db,
        actor.id,
        "change",
        `${actor.displayName} reset and unset ${week.title}.`,
        weekId,
        { preservedCompletedSessions: preservedCompleted.map((item) => item.title) },
      );
      return Response.json({
        ok: true,
        preservedCompletedCount: preservedCompleted.length,
        preservedCompletedSessions: preservedCompleted.map((item) => item.title),
      });
    }

    if (action === "markRestComplete") {
      const sessionId = asString(body.sessionId);
      const [sessionRow] = await db
        .select()
        .from(athleteSessions)
        .where(
          and(
            eq(athleteSessions.id, sessionId),
            eq(athleteSessions.athleteId, actor.id),
          ),
        )
        .limit(1);
      if (!sessionRow) return apiError("Rest day not found.", 404);
      if (sessionRow.category !== "recovery" && sessionRow.workoutKind !== "rest") {
        return apiError("Only a Rest / Recovery session can be marked this way.", 409);
      }
      await db
        .update(athleteSessions)
        .set({ status: "completed", completedAt: nowIso(), updatedAt: nowIso() })
        .where(eq(athleteSessions.id, sessionRow.id));
      await db
        .update(plannedWeeks)
        .set({ status: "in_progress", updatedAt: nowIso() })
        .where(eq(plannedWeeks.id, sessionRow.weekId));
      return Response.json({ ok: true });
    }

    if (action === "completeWorkout" || action === "completeStrength") {
      const sessionId = asString(body.sessionId);
      const [sessionRow] = await db
        .select()
        .from(athleteSessions)
        .where(and(eq(athleteSessions.id, sessionId), eq(athleteSessions.athleteId, actor.id)))
        .limit(1);
      if (!sessionRow) return apiError("Session not found.", 404);
      if (sessionRow.category === "recovery" || sessionRow.workoutKind === "rest") {
        return apiError("Rest days do not use the workout result form.", 409);
      }
      const resultId = `result-${sessionRow.id}`;
      const completedDate = asString(body.completedDate, todayIso());
      const rpe = clampScore(body.rpe);
      const feel = clampScore(body.feel);
      const averagePace = asString(body.averagePace);
      const totalTime = asString(body.totalTime);
      const distance = asNumber(body.distance);
      const rounds = asNumber(body.rounds);
      const reps = asNumber(body.reps);
      const calories = asNumber(body.calories);
      const customValue = asNumber(body.customValue);
      const notes = asString(body.notes);
      if (rpe === null || feel === null) return apiError("RPE and feel are required from 1 to 10.");

      // Resolve every submitted slot/exercise/set before touching the result
      // or deleting a prior performance. This makes ordinary validation
      // failures non-destructive.
      if (action === "completeStrength") {
        try {
          await completeStrengthEntries(db, { resultId, athleteId: actor.id, completedDate, entries: (Array.isArray(body.exercises) ? body.exercises : []) as Array<Record<string, unknown>>, validateOnly: true });
        } catch (error) {
          return apiError(error instanceof Error ? error.message : "Invalid strength entry.", 422);
        }
      }

      await db
        .insert(workoutResults)
        .values({
          id: resultId,
          sessionId: sessionRow.id,
          athleteId: actor.id,
          completedDate,
          rpe,
          feel,
          averagePace,
          totalTime,
          distance,
          rounds,
          reps: reps === null ? null : Math.max(0, Math.round(reps)),
          calories: calories === null ? null : Math.max(0, Math.round(calories)),
          customValue,
          notes,
          updatedAt: nowIso(),
        })
        .onConflictDoUpdate({
          target: workoutResults.sessionId,
          set: {
            completedDate,
            rpe,
            feel,
            averagePace,
            totalTime,
            distance,
            rounds,
            reps: reps === null ? null : Math.max(0, Math.round(reps)),
            calories: calories === null ? null : Math.max(0, Math.round(calories)),
            customValue,
            notes,
            updatedAt: nowIso(),
          },
        });

      let progressionMessages: string[] = [];
      if (action === "completeStrength") {
        try {
          const completion = await completeStrengthEntries(db, { resultId, athleteId: actor.id, completedDate, entries: (Array.isArray(body.exercises) ? body.exercises : []) as Array<Record<string, unknown>> });
          progressionMessages = completion.progressionMessages;
        } catch (error) {
          return apiError(error instanceof Error ? error.message : "Unable to complete strength workout.", 422);
        }
        /*
         * The completion domain above performs all validated writes. Keeping
         * the legacy inline path out of the request prevents duplicate
         * performances and ensures replacement failures cannot delete history.
         */
      }
      /* legacy inline strength mutation removed; completeStrengthEntries is the canonical path. */
      /*
      if (false) {
        const entries = Array.isArray(body.exercises) ? body.exercises : [];
        for (const rawEntry of entries) {
          if (!rawEntry || typeof rawEntry !== "object") continue;
          const entry = rawEntry as Record<string, unknown>;
          const slotId = asString(entry.slotId);
          const exerciseId = asString(entry.exerciseId);
          const note = asString(entry.note);
          const rawSets = Array.isArray(entry.sets) ? entry.sets : [];
          const parsedSets = rawSets
            .map((raw, index) => {
              const set = (raw ?? {}) as Record<string, unknown>;
              return {
                setNumber: index + 1,
                weightKg: asNumber(set.weightKg, 0) ?? 0,
                reps: Math.max(0, Math.round(asNumber(set.reps, 0) ?? 0)),
              };
            })
            .filter((set) => set.weightKg >= 0 && set.reps > 0);
          if (!slotId || !exerciseId || !parsedSets.length) return apiError("Each strength entry needs a slot, exercise, and at least one completed set.");

          // V2 builders submit catalogue exercise/focus-slot ids while V1
          // history tables remain the canonical progression ledger. Resolve
          // both ids explicitly; never silently drop a valid V2 entry.
          let historySlotId = slotId;
          let [slot] = await db.select().from(strengthSlots).where(eq(strengthSlots.id, slotId)).limit(1);
          if (!slot) {
            const [v2Slot] = await db.select().from(strengthFocusSlots).where(eq(strengthFocusSlots.id, slotId)).limit(1);
            if (v2Slot) {
              historySlotId = v2Slot.historySlotId ?? "";
              if (historySlotId) [slot] = await db.select().from(strengthSlots).where(eq(strengthSlots.id, historySlotId)).limit(1);
            }
          }
          if (!slot || !historySlotId) return apiError(`Unknown strength slot: ${slotId}. Refresh the workout and try again.`, 422);

          let historyExerciseId = exerciseId;
          let [exercise] = await db.select().from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
          if (!exercise) {
            const [catalogue] = await db.select().from(catalogueExercises).where(eq(catalogueExercises.id, exerciseId)).limit(1);
            if (catalogue) {
              historyExerciseId = catalogue.legacyExerciseId ?? `catalogue-${catalogue.id}`;
              [exercise] = await db.select().from(exercises).where(eq(exercises.id, historyExerciseId)).limit(1);
            }
          }
          if (!exercise) return apiError(`Unknown strength exercise: ${exerciseId}. Refresh the workout and try again.`, 422);

          const [resolvedSlot, resolvedExercise, existingState, exerciseSetting] = await Promise.all([
            Promise.resolve(slot),
            Promise.resolve(exercise),
            db
              .select()
              .from(progressionStates)
              .where(and(eq(progressionStates.athleteId, actor.id), eq(progressionStates.exerciseId, historyExerciseId)))
              .limit(1)
              .then((rows) => rows[0]),
            db
              .select()
              .from(athleteExerciseSettings)
              .where(
                and(
                  eq(athleteExerciseSettings.athleteId, actor.id),
                  eq(athleteExerciseSettings.exerciseId, historyExerciseId),
                ),
              )
              .limit(1)
              .then((rows) => rows[0]),
          ]);
          slot = resolvedSlot;
          exercise = resolvedExercise;
          if (!slot || !exercise) return apiError("Unable to resolve the submitted strength entry.", 422);
          const resolvedExerciseId = historyExerciseId;
          const workingLoadKg = Math.max(...parsedSets.map((set) => set.weightKg));
          const performanceId = `performance-${resultId}-${slotId}`;
          await db.insert(exercisePerformances).values({
            id: performanceId,
            resultId,
            athleteId: actor.id,
            exerciseId: resolvedExerciseId,
            slotId: historySlotId,
            workingLoadKg,
            note,
            performedAt: completedDate,
          });
          await db.insert(strengthSets).values(
            parsedSets.map((set) => ({
              id: `set-${performanceId}-${set.setNumber}`,
              performanceId,
              ...set,
            })),
          );

          const progression = calculateProgression({
            currentLoadKg: existingState?.currentLoadKg ?? null,
            pendingRecommendationKg: existingState?.recommendedLoadKg ?? null,
            workingLoadKg,
            reps: parsedSets.map((set) => set.reps),
            repHigh: slot.repHigh,
            incrementKg:
              exerciseSetting?.loadIncrementKg ??
              exercise.defaultIncrementKg ??
              actor.loadIncrementKg ??
              2.5,
          });
          const {
            acceptedPending,
            earnedProgression,
            currentLoadKg,
            recommendedLoadKg,
          } = progression;
          const createdRecommendation =
            earnedProgression &&
            (existingState?.recommendedLoadKg === null ||
              existingState?.recommendedLoadKg === undefined ||
              acceptedPending);
          if (createdRecommendation && recommendedLoadKg !== null) {
            progressionMessages.push(`${exercise.name}: try ${recommendedLoadKg} kg next time`);
          } else if (acceptedPending) {
            progressionMessages.push(`${exercise.name} progressed to ${workingLoadKg} kg`);
          }
          await db
            .insert(progressionStates)
            .values({
              athleteId: actor.id,
              exerciseId: resolvedExerciseId,
              currentLoadKg,
              recommendedLoadKg,
              lastPerformanceId: performanceId,
              updatedAt: nowIso(),
            })
            .onConflictDoUpdate({
              target: [progressionStates.athleteId, progressionStates.exerciseId],
              set: {
                currentLoadKg,
                recommendedLoadKg,
                lastPerformanceId: performanceId,
                updatedAt: nowIso(),
              },
            });
        }
        }

      */
      await db
        .update(athleteSessions)
        .set({ status: "completed", completedAt: nowIso(), updatedAt: nowIso() })
        .where(eq(athleteSessions.id, sessionRow.id));
      await db
        .update(plannedWeeks)
        .set({ status: "in_progress", updatedAt: nowIso() })
        .where(eq(plannedWeeks.id, sessionRow.weekId));
      const progression = await completeProgressionForSession(db, sessionRow, actor.id);
      if (progression.message) progressionMessages.push(progression.message);
      const paceNote = averagePace ? ` — ${averagePace}/km avg rep pace` : "";
      await createActivity(
        db,
        actor.id,
        "completion",
        `${actor.displayName} completed ${sessionRow.title} — RPE ${rpe}${paceNote}`,
        sessionRow.id,
        { progressionMessages },
      );
      for (const message of progressionMessages) {
        await createActivity(db, actor.id, "progression", `${actor.displayName}: ${message}.`, sessionRow.id);
      }
      return Response.json({ ok: true, progressionMessages });
    }

    if (action === "createWorkout" || action === "updateWorkout") {
      const workoutId = asString(body.workoutId);
      const existing = action === "updateWorkout"
        ? await db
            .select()
            .from(workoutLibraryItems)
            .where(eq(workoutLibraryItems.id, workoutId))
            .limit(1)
            .then((rows) => rows[0])
        : null;
      if (action === "updateWorkout" && !existing) return apiError("Workout not found.", 404);
      if (existing && (existing.isBuiltIn || existing.ownerAthleteId !== actor.id)) {
        return apiError("Only your user-created workouts can be edited.", 403);
      }
      const name = asString(body.name, existing?.name ?? "");
      const family = asString(body.family, existing?.family ?? "other");
      const category = asString(body.category, existing?.category ?? "recovery");
      const resultType = asString(body.resultType, existing?.resultType ?? "completion");
      const mainSet = asString(body.mainSet, existing?.mainSet ?? "");
      if (!name || !mainSet) return apiError("Workout name and main workout are required.");
      if (!validWorkoutFamilies.has(family)) return apiError("Choose a valid workout category.");
      if (!validCategories.has(category)) return apiError("Choose how this workout counts toward weekly targets.");
      if (!validResultTypes.has(resultType)) return apiError("Choose a valid result type.");
      const values = {
        ownerAthleteId: actor.id,
        name,
        family,
        category,
        prescription: asString(body.prescription, mainSet),
        purpose: asString(body.purpose, existing?.purpose ?? ""),
        estimatedDuration: asString(body.estimatedDuration, existing?.estimatedDuration ?? ""),
        warmUp: asString(body.warmUp, existing?.warmUp ?? ""),
        mainSet,
        recovery: asString(body.recovery, existing?.recovery ?? ""),
        intensityGuidance: asString(body.intensityGuidance, existing?.intensityGuidance ?? ""),
        coolDown: asString(body.coolDown, existing?.coolDown ?? ""),
        equipment: asString(body.equipment, existing?.equipment ?? ""),
        notes: asString(body.notes, existing?.notes ?? ""),
        resultType,
        customResultLabel: asString(body.customResultLabel, existing?.customResultLabel ?? ""),
        strengthTemplateId: asString(body.strengthTemplateId, existing?.strengthTemplateId ?? "") || null,
        priorityEmphasis: asString(body.priorityEmphasis, existing?.priorityEmphasis ?? "balanced"),
        isBuiltIn: false,
        deletedAt: null,
        updatedAt: nowIso(),
      };
      const id = existing?.id ?? `workout-${crypto.randomUUID()}`;
      if (existing) {
        await db.update(workoutLibraryItems).set(values).where(eq(workoutLibraryItems.id, id));
      } else {
        await db.insert(workoutLibraryItems).values({ id, ...values, createdAt: nowIso() });
        await createActivity(
          db,
          actor.id,
          "workout",
          `${actor.displayName} created “${name}”.`,
          id,
        );
      }
      if (Boolean(body.favourite)) {
        await db
          .insert(workoutFavourites)
          .values({ athleteId: actor.id, workoutId: id })
          .onConflictDoNothing();
      }
      // Coverage belongs to the current workout family, never to a historic
      // version of it. Clear first so HYROX → Running cannot retain stale
      // direct-station metadata.
      await db.delete(workoutHyroxCoverage).where(eq(workoutHyroxCoverage.workoutId, id));
      if (family === "hyrox") {
        const stations = Array.isArray(body.directHyroxStations) ? [...new Set(body.directHyroxStations.filter((item): item is string => typeof item === "string" && V2_HYROX_STATIONS.includes(item as (typeof V2_HYROX_STATIONS)[number])))] : [];
        if (stations.length) await db.insert(workoutHyroxCoverage).values(stations.map((station) => ({ workoutId: id, station, exposure: "direct" })));
      }
      return Response.json({ ok: true, workoutId: id });
    }

    if (action === "duplicateWorkout") {
      const sourceId = asString(body.workoutId);
      const [source] = await db
        .select()
        .from(workoutLibraryItems)
        .where(and(eq(workoutLibraryItems.id, sourceId), isNull(workoutLibraryItems.deletedAt)))
        .limit(1);
      if (!source) return apiError("Workout not found.", 404);
      const id = `workout-${crypto.randomUUID()}`;
      const name = asString(body.name, `${source.name} copy`);
      await db.insert(workoutLibraryItems).values({
        id,
        ownerAthleteId: actor.id,
        name,
        family: source.family,
        category: source.category,
        prescription: source.prescription,
        purpose: source.purpose,
        estimatedDuration: source.estimatedDuration,
        warmUp: source.warmUp,
        mainSet: source.mainSet,
        recovery: source.recovery,
        intensityGuidance: source.intensityGuidance,
        coolDown: source.coolDown,
        equipment: source.equipment,
        notes: source.notes,
        resultType: source.resultType,
        customResultLabel: source.customResultLabel,
        strengthTemplateId: source.strengthTemplateId,
        priorityEmphasis: source.priorityEmphasis,
        isBuiltIn: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      await createActivity(
        db,
        actor.id,
        "workout",
        `${actor.displayName} created “${name}” from ${source.name}.`,
        id,
      );
      return Response.json({ ok: true, workoutId: id });
    }

    if (action === "deleteWorkout") {
      const workoutId = asString(body.workoutId);
      const [workout] = await db
        .select()
        .from(workoutLibraryItems)
        .where(eq(workoutLibraryItems.id, workoutId))
        .limit(1);
      if (!workout) return apiError("Workout not found.", 404);
      if (workout.isBuiltIn || workout.ownerAthleteId !== actor.id) {
        return apiError("Only your user-created workouts can be deleted.", 403);
      }
      await db
        .update(workoutLibraryItems)
        .set({ deletedAt: nowIso(), updatedAt: nowIso() })
        .where(eq(workoutLibraryItems.id, workoutId));
      await db
        .delete(workoutFavourites)
        .where(
          and(
            eq(workoutFavourites.athleteId, actor.id),
            eq(workoutFavourites.workoutId, workoutId),
          ),
        );
      return Response.json({ ok: true });
    }

    if (action === "toggleFavourite") {
      const workoutId = asString(body.workoutId);
      const [workout] = await db
        .select()
        .from(workoutLibraryItems)
        .where(and(eq(workoutLibraryItems.id, workoutId), isNull(workoutLibraryItems.deletedAt)))
        .limit(1);
      if (!workout) return apiError("Workout not found.", 404);
      const [existing] = await db
        .select()
        .from(workoutFavourites)
        .where(
          and(
            eq(workoutFavourites.athleteId, actor.id),
            eq(workoutFavourites.workoutId, workoutId),
          ),
        )
        .limit(1);
      if (existing) {
        await db
          .delete(workoutFavourites)
          .where(
            and(
              eq(workoutFavourites.athleteId, actor.id),
              eq(workoutFavourites.workoutId, workoutId),
            ),
          );
      } else {
        await db.insert(workoutFavourites).values({ athleteId: actor.id, workoutId });
        await createActivity(
          db,
          actor.id,
          "workout",
          `${actor.displayName} favourited ${workout.name}.`,
          workoutId,
        );
      }
      return Response.json({ ok: true, favourite: !existing });
    }

    if (action === "updateExerciseSettings") {
      const exerciseId = asString(body.exerciseId);
      const [exercise] = await db
        .select()
        .from(exercises)
        .where(eq(exercises.id, exerciseId))
        .limit(1);
      if (!exercise) return apiError("Exercise not found.", 404);
      const convention = asString(body.loadConvention);
      if (convention && !validLoadConventions.has(convention)) {
        return apiError("Choose a valid load convention.");
      }
      const increment = asNumber(body.loadIncrementKg);
      const approvedAlternativeIds = Array.isArray(body.approvedAlternativeIds)
        ? body.approvedAlternativeIds.filter((value): value is string => typeof value === "string")
        : [];
      const defaultAlternativeId = asString(body.defaultAlternativeId) || null;
      if (defaultAlternativeId && !approvedAlternativeIds.includes(defaultAlternativeId) && defaultAlternativeId !== exerciseId) {
        return apiError("The default alternative must also be approved.");
      }
      const values = {
        preferredName: asString(body.preferredName),
        loadConvention: convention || null,
        loadIncrementKg: increment === null ? null : Math.max(0, increment),
        approvedAlternativesJson: JSON.stringify(approvedAlternativeIds),
        defaultAlternativeId,
        notes: asString(body.notes),
        updatedAt: nowIso(),
      };
      await db
        .insert(athleteExerciseSettings)
        .values({ athleteId: actor.id, exerciseId, ...values })
        .onConflictDoUpdate({
          target: [athleteExerciseSettings.athleteId, athleteExerciseSettings.exerciseId],
          set: values,
        });
      return Response.json({ ok: true });
    }

    if (action === "setCurrentLocation") {
      const locationId = asString(body.locationId);
      const [location] = await db.select().from(trainingLocations).where(and(eq(trainingLocations.id, locationId), eq(trainingLocations.teamId, TEAM_ID), eq(trainingLocations.active, true))).limit(1);
      if (!location) return apiError("Choose an active team location.");
      await db.insert(athleteCurrentLocations).values({ athleteId: actor.id, locationId, updatedAt: nowIso() }).onConflictDoUpdate({ target: athleteCurrentLocations.athleteId, set: { locationId, updatedAt: nowIso() } });
      await createActivity(db, actor.id, "setting", `${actor.displayName} changed current training location to ${location.name}.`, locationId);
      return Response.json({ ok: true });
    }

    if (action === "setSessionLocation") {
      const sessionId = asString(body.sessionId);
      const locationId = asString(body.locationId);
      const [session] = await db.select().from(athleteSessions).where(and(eq(athleteSessions.id, sessionId), eq(athleteSessions.athleteId, actor.id))).limit(1);
      if (!session) return apiError("Session not found.", 404);
      if (locationId) {
        const [location] = await db.select().from(trainingLocations).where(and(eq(trainingLocations.id, locationId), eq(trainingLocations.teamId, TEAM_ID), eq(trainingLocations.active, true))).limit(1);
        if (!location) return apiError("Choose an active team location.");
      }
      await db.update(athleteSessions).set({ locationId: locationId || null, updatedAt: nowIso() }).where(eq(athleteSessions.id, sessionId));
      return Response.json({ ok: true });
    }

    if (action === "saveLocation") {
      const locationId = asString(body.locationId);
      const name = asString(body.name);
      const equipment = Array.isArray(body.equipment) ? [...new Set(body.equipment.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
      if (!name) return apiError("Location name is required.");
      const id = locationId || `location-${crypto.randomUUID()}`;
      const existing = locationId ? await db.select().from(trainingLocations).where(and(eq(trainingLocations.id, locationId), eq(trainingLocations.teamId, TEAM_ID))).limit(1).then((rows) => rows[0]) : null;
      if (existing) await db.update(trainingLocations).set({ name, notes: asString(body.notes), active: true, updatedAt: nowIso() }).where(eq(trainingLocations.id, id));
      else await db.insert(trainingLocations).values({ id, teamId: TEAM_ID, name, notes: asString(body.notes), active: true, updatedAt: nowIso() });
      await db.delete(locationEquipment).where(eq(locationEquipment.locationId, id));
      for (const batch of d1InsertBatches(equipment.map((item) => ({ locationId: id, equipment: item })))) await db.insert(locationEquipment).values(batch).onConflictDoNothing();
      await createActivity(db, actor.id, "setting", `${actor.displayName} updated ${name} equipment.`, id);
      return Response.json({ ok: true, locationId: id });
    }

    if (action === "deleteLocation") {
      const locationId = asString(body.locationId);
      const [location] = await db.select().from(trainingLocations).where(and(eq(trainingLocations.id, locationId), eq(trainingLocations.teamId, TEAM_ID))).limit(1);
      if (!location) return apiError("Location not found.", 404);
      const used = await db.select({ id: athleteCurrentLocations.athleteId }).from(athleteCurrentLocations).where(eq(athleteCurrentLocations.locationId, locationId)).limit(1);
      if (used.length) return apiError("This location is currently selected by an athlete. Change their Current Location first.", 409);
      const usedByWeeks = await db.select({ id: weekTypeTemplates.id }).from(weekTypeTemplates).where(eq(weekTypeTemplates.defaultLocationId, locationId)).limit(1);
      if (usedByWeeks.length) return apiError("This location is used by a Week Type and cannot be deleted.", 409);
      await db.update(trainingLocations).set({ active: false, updatedAt: nowIso() }).where(eq(trainingLocations.id, locationId));
      return Response.json({ ok: true });
    }

    if (action === "savePriorities") {
      const athleteId = asString(body.athleteId, actor.id);
      if (!new Set([actor.id, "thomas", "kt"]).has(athleteId)) return apiError("Choose a valid athlete.");
      if (athleteId !== actor.id) return apiError("You can only edit your own priorities.", 403);
      const stations = Array.isArray(body.stations) ? body.stations.filter((item): item is string => typeof item === "string") : [];
      const selected = stations.slice(0, 3);
      if (new Set(selected).size !== selected.length || selected.some((station) => !V2_HYROX_STATIONS.includes(station as (typeof V2_HYROX_STATIONS)[number]))) return apiError("Choose up to three different HYROX stations.");
      await db.delete(athleteHyroxPriorities).where(eq(athleteHyroxPriorities.athleteId, athleteId));
      for (const batch of d1InsertBatches(selected.map((station, index) => ({ athleteId, rank: index + 1, station, updatedAt: nowIso() })))) await db.insert(athleteHyroxPriorities).values(batch);
      await createActivity(db, actor.id, "setting", `${actor.displayName} updated their HYROX station priorities.`, athleteId);
      return Response.json({ ok: true });
    }

    if (action === "createTrainingFocus" || action === "updateTrainingFocus") {
      const focusId = asString(body.focusId);
      const name = asString(body.name);
      if (!name) return apiError("Training Focus name is required.");
      const id = focusId || `focus-custom-${crypto.randomUUID()}`;
      const existing = focusId ? await db.select().from(trainingFocuses).where(eq(trainingFocuses.id, focusId)).limit(1).then((rows) => rows[0]) : null;
      if (existing?.isBuiltIn && action === "updateTrainingFocus") {
        await db.update(trainingFocuses).set({ name, purpose: asString(body.purpose), defaultPrescription: asString(body.defaultPrescription), primaryMuscles: asString(body.primaryMuscles), programmingNotes: asString(body.programmingNotes), updatedAt: nowIso() }).where(eq(trainingFocuses.id, id));
      } else if (existing) return apiError("That Training Focus already exists.", 409);
      else await db.insert(trainingFocuses).values({ id, name, purpose: asString(body.purpose), defaultPrescription: asString(body.defaultPrescription), primaryMuscles: asString(body.primaryMuscles), hyroxLinksJson: JSON.stringify(Array.isArray(body.hyroxLinks) ? body.hyroxLinks : []), programmingNotes: asString(body.programmingNotes), isBuiltIn: false, active: true, baseJson: "{}", updatedAt: nowIso() });
      return Response.json({ ok: true, focusId: id });
    }

    if (action === "saveStrengthTemplate") {
      const templateId = asString(body.templateId);
      const name = asString(body.name);
      const slots = Array.isArray(body.slots) ? body.slots : [];
      if (!name) return apiError("Strength template name is required.");
      const sourceId = templateId;
      const existing = sourceId ? await db.select().from(strengthTemplates).where(eq(strengthTemplates.id, sourceId)).limit(1).then((rows) => rows[0]) : null;
      const cloneBuiltIn = Boolean(existing?.isBuiltIn && body.editBuiltIn !== true);
      const id = cloneBuiltIn || !sourceId ? `strength-template-${crypto.randomUUID()}` : sourceId;
      if (cloneBuiltIn && slots.length === 0 && sourceId) {
        const cloned = await cloneStrengthTemplate(db, sourceId, { id, teamId: TEAM_ID, name, purpose: asString(body.purpose) });
        await createActivity(db, actor.id, "workout", `${actor.displayName} cloned ${name} in the Strength Builder.`, id);
        return Response.json({ ok: true, templateId: cloned.id });
      }
      if (existing && !cloneBuiltIn) await db.update(strengthTemplates).set({ name, purpose: asString(body.purpose), updatedAt: nowIso() }).where(eq(strengthTemplates.id, id));
      else if (!existing || cloneBuiltIn) await db.insert(strengthTemplates).values({ id, teamId: TEAM_ID, name, purpose: asString(body.purpose), isBuiltIn: false, baseTemplateId: cloneBuiltIn ? sourceId : null, active: true, updatedAt: nowIso() });
      const previousSlots = await db.select().from(strengthFocusSlots).where(eq(strengthFocusSlots.templateId, id));
      await db.delete(strengthFocusSlots).where(eq(strengthFocusSlots.templateId, id));
      const slotRows: Array<typeof strengthFocusSlots.$inferInsert> = [];
      for (const [index, slot] of slots.entries()) {
        const row = (slot ?? {}) as Record<string, unknown>;
        const focusId = asString(row.focusId);
        if (!focusId) continue;
        const requestedId = asString(row.id);
        const slotId = cloneBuiltIn || !requestedId || requestedId.startsWith("draft-") ? `${id}-slot-${index + 1}` : requestedId;
        const exerciseId = asString(row.exerciseId) || null;
        const catalogue = exerciseId ? await db.select().from(catalogueExercises).where(eq(catalogueExercises.id, exerciseId)).limit(1).then((rows) => rows[0]) : null;
        if (exerciseId && !catalogue) return apiError("Choose a valid catalogue exercise for each Strength Focus.", 422);
        const historyExerciseId = catalogue ? catalogue.legacyExerciseId ?? `catalogue-${catalogue.id}` : null;
        const prior = previousSlots.find((item) => item.id === slotId);
        const historySlotId = prior?.historySlotId ?? `${slotId}-history`;
        const prescription = asString(row.prescription);
        const numbers = prescription.match(/(\d+)\s*[×x]\s*(\d+)(?:\s*[–-]\s*(\d+))?/i);
        const focus = await db.select().from(trainingFocuses).where(eq(trainingFocuses.id, focusId)).limit(1).then((rows) => rows[0]);
        if (historyExerciseId) {
          await db.insert(strengthSlots).values({ id: historySlotId, workoutKind: id, sortOrder: index, trainingGoal: focus?.name ?? "V2 Training Focus", defaultExerciseId: historyExerciseId, workingSets: numbers ? Number(numbers[1]) : 3, repLow: numbers ? Number(numbers[2]) : 8, repHigh: numbers ? Number(numbers[3] ?? numbers[2]) : 10 }).onConflictDoUpdate({ target: strengthSlots.id, set: { sortOrder: index, trainingGoal: focus?.name ?? "V2 Training Focus", defaultExerciseId: historyExerciseId, workingSets: numbers ? Number(numbers[1]) : 3, repLow: numbers ? Number(numbers[2]) : 8, repHigh: numbers ? Number(numbers[3] ?? numbers[2]) : 10 } });
        }
        slotRows.push({ id: slotId, templateId: id, focusId, exerciseId, historySlotId: historyExerciseId ? historySlotId : null, prescription, sortOrder: index, notes: asString(row.notes) });
      }
      for (const batch of d1InsertBatches(slotRows)) await db.insert(strengthFocusSlots).values(batch);
      await createActivity(db, actor.id, "workout", `${actor.displayName} saved ${name} in the Strength Builder.`, id);
      return Response.json({ ok: true, templateId: id });
    }

    if (action === "resetStrengthTemplate") {
      const templateId = asString(body.templateId);
      const [template] = await db.select().from(strengthTemplates).where(and(eq(strengthTemplates.id, templateId), eq(strengthTemplates.isBuiltIn, true))).limit(1);
      if (!template) return apiError("Only a built-in Strength A/B template can be reset.", 404);
      const baseSlots = JSON.parse(template.baseJson || "[]") as Array<Record<string, unknown>>;
      await db.delete(strengthFocusSlots).where(eq(strengthFocusSlots.templateId, templateId));
      for (const [index, slot] of baseSlots.entries()) {
        const slotId = asString(slot.id, `${templateId}-slot-${index}`);
        const historySlotId = asString(slot.historySlotId, slotId);
        await db.insert(strengthFocusSlots).values({ id: slotId, templateId, focusId: asString(slot.focusId), exerciseId: asString(slot.exerciseId) || null, historySlotId, prescription: asString(slot.prescription), sortOrder: index, notes: asString(slot.notes) });
      }
      return Response.json({ ok: true, templateId });
    }

    if (action === "saveProgressionTrack") {
      const trackId = asString(body.trackId);
      const name = asString(body.name);
      const steps = Array.isArray(body.steps) ? body.steps : [];
      if (!name) return apiError("Progression name is required.");
      if (!steps.length) return apiError("A progression track needs at least one step.", 422);
      const id = trackId || `track-custom-${crypto.randomUUID()}`;
      const existing = trackId ? await db.select().from(progressionTracks).where(eq(progressionTracks.id, trackId)).limit(1).then((rows) => rows[0]) : null;
      const rows = steps.map((step, index) => { const item = (step ?? {}) as Record<string, unknown>; return { id: asString(item.id) || `${id}-step-${crypto.randomUUID()}`, trackId: id, workoutId: asString(item.workoutId) || null, title: asString(item.title, `Step ${index + 1}`), prescription: asString(item.prescription), sortOrder: index }; });
      if (new Set(rows.map((row) => row.id)).size !== rows.length) return apiError("Progression steps need unique identities.", 422);
      const linkedWorkoutIds = rows.map((row) => row.workoutId).filter((item): item is string => Boolean(item));
      if (linkedWorkoutIds.length) {
        const found = await db.select({ id: workoutLibraryItems.id }).from(workoutLibraryItems).where(inArray(workoutLibraryItems.id, linkedWorkoutIds));
        if (found.length !== new Set(linkedWorkoutIds).size) return apiError("Choose valid Workout Library items for linked progression steps.", 422);
      }
      // Validate the whole track before changing its metadata. Retained steps
      // keep their durable IDs so planned/history sessions remain valid.
      const previous = await db.select().from(progressionSteps).where(eq(progressionSteps.trackId, id));
      const retained = new Set(rows.map((row) => row.id));
      const removed = previous.filter((step) => !retained.has(step.id));
      if (removed.length) {
        const removedIds = removed.map((step) => step.id);
        const [sharedUse, athleteUse] = await Promise.all([
          db.select({ id: sharedSessions.id }).from(sharedSessions).where(inArray(sharedSessions.progressionStepId, removedIds)).limit(1),
          db.select({ id: athleteSessions.id }).from(athleteSessions).where(inArray(athleteSessions.progressionStepId, removedIds)).limit(1),
        ]);
        if (sharedUse.length || athleteUse.length) return apiError("A progression step is linked to planned or historical training and cannot be deleted.", 409);
        await db.delete(progressionSteps).where(inArray(progressionSteps.id, removedIds));
      }
      if (existing) await db.update(progressionTracks).set({ name, purpose: asString(body.purpose), updatedAt: nowIso() }).where(eq(progressionTracks.id, id));
      else await db.insert(progressionTracks).values({ id, teamId: TEAM_ID, name, purpose: asString(body.purpose), isBuiltIn: false, active: true, updatedAt: nowIso() });
      for (const [index, row] of rows.entries()) {
        const current = previous.find((step) => step.id === row.id);
        if (current) await db.update(progressionSteps).set({ workoutId: row.workoutId, title: row.title, prescription: row.prescription, sortOrder: index }).where(eq(progressionSteps.id, row.id));
        else await db.insert(progressionSteps).values({ ...row, sortOrder: index });
      }
      return Response.json({ ok: true, trackId: id });
    }

    if (action === "updateWeekTypeTemplate") {
      const templateId = asString(body.templateId);
      const [template] = await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, templateId)).limit(1);
      if (!template) return apiError("Week Type not found.", 404);
      const update = { name: asString(body.name, template.name), rationale: asString(body.rationale, template.rationale), hardTarget: Math.max(0, Math.round(asNumber(body.hardTarget, template.hardTarget) ?? template.hardTarget)), strengthTarget: Math.max(0, Math.round(asNumber(body.strengthTarget, template.strengthTarget) ?? template.strengthTarget)), easyTarget: Math.max(0, Math.round(asNumber(body.easyTarget, template.easyTarget) ?? template.easyTarget)), defaultLocationId: Object.prototype.hasOwnProperty.call(body, "defaultLocationId") ? (asString(body.defaultLocationId) || null) : template.defaultLocationId, priorityEmphasis: asString(body.priorityEmphasis, template.priorityEmphasis), updatedAt: nowIso() };
      if (Array.isArray(body.intents)) {
        const intents = body.intents as Array<Record<string, unknown>>;
        const days = intents.map((item) => asNumber(item.day));
        if (intents.length !== 7 || new Set(days).size !== 7 || days.some((day) => day === null || day < 0 || day > 6)) return apiError("A Week Type needs seven unique Monday–Sunday intents.", 422);
        const rows = intents.map((item) => ({ id: `${templateId}-${asNumber(item.day)}`, weekTypeId: templateId, day: asNumber(item.day) as number, intent: asString(item.intent, "Rest / recovery"), workoutId: asString(item.workoutId) || null, strengthTemplateId: asString(item.strengthTemplateId) || null, progressionTrackId: asString(item.progressionTrackId) || null, locationId: asString(item.locationId) || null, priorityEmphasis: asString(item.priorityEmphasis, "balanced"), category: asString(item.category, "recovery"), workoutKind: asString(item.workoutKind, "recovery"), details: asString(item.details), isQualityIntent: Boolean(item.isQualityIntent) }));
        if (rows.some((row) => !validCategories.has(row.category) || !["balanced", "thomas", "kt"].includes(row.priorityEmphasis))) return apiError("One or more daily intents has an invalid category or priority emphasis.", 422);
        const qualityRows = rows.filter((row) => row.isQualityIntent);
        if (qualityRows.length > 1) return apiError("A Week Type can have only one programme progression day.", 422);
        if (qualityRows.some((row) => row.category === "recovery" || row.workoutKind === "recovery")) return apiError("Rest / Recovery cannot be the programme progression day.", 422);
        const [workouts, templates, tracks, locations] = await Promise.all([db.select({ id: workoutLibraryItems.id }).from(workoutLibraryItems), db.select({ id: strengthTemplates.id }).from(strengthTemplates), db.select({ id: progressionTracks.id }).from(progressionTracks), db.select({ id: trainingLocations.id }).from(trainingLocations)]);
        if ((update.defaultLocationId && !locations.some((item) => item.id === update.defaultLocationId)) || rows.some((row) => (row.workoutId && !workouts.some((item) => item.id === row.workoutId)) || (row.strengthTemplateId && !templates.some((item) => item.id === row.strengthTemplateId)) || (row.progressionTrackId && !tracks.some((item) => item.id === row.progressionTrackId)) || (row.locationId && !locations.some((item) => item.id === row.locationId)))) return apiError("One or more daily intent references an unavailable workout, Strength template, progression or location.", 422);
        // Only replace the existing day structure after the full payload has
        // resolved. A malformed editor submission therefore leaves the prior
        // seven-day Week Type intact.
        await db.update(weekTypeTemplates).set(update).where(eq(weekTypeTemplates.id, templateId));
        await db.delete(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, templateId));
        for (const batch of d1InsertBatches(rows)) await db.insert(weekTypeDayIntents).values(batch);
      } else {
        await db.update(weekTypeTemplates).set(update).where(eq(weekTypeTemplates.id, templateId));
      }
      return Response.json({ ok: true, templateId });
    }

    if (action === "duplicateWeekType") {
      const sourceId = asString(body.templateId);
      const [source] = await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, sourceId)).limit(1);
      if (!source) return apiError("Week Type not found.", 404);
      const id = `week-type-custom-${crypto.randomUUID()}`;
      await db.insert(weekTypeTemplates).values({ ...source, id, name: asString(body.name, `${source.name} copy`), isBuiltIn: false, baseJson: "{}", createdAt: nowIso(), updatedAt: nowIso() });
      const intents = await db.select().from(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, sourceId));
      if (intents.length) await db.insert(weekTypeDayIntents).values(intents.map((intent) => ({ ...intent, id: `${id}-${intent.day}`, weekTypeId: id })));
      return Response.json({ ok: true, templateId: id });
    }

    if (action === "createWeekType") {
      const name = asString(body.name, "New Week Type").trim();
      if (!name) return apiError("Week Type name is required.", 422);
      const id = `week-type-custom-${crypto.randomUUID()}`;
      const now = nowIso();
      await db.insert(weekTypeTemplates).values({ id, teamId: TEAM_ID, name, rationale: asString(body.rationale), hardTarget: 0, strengthTarget: 0, easyTarget: 0, defaultLocationId: null, priorityEmphasis: "balanced", isBuiltIn: false, active: true, baseJson: "{}", updatedAt: now });
      const rows = Array.from({ length: 7 }, (_, day) => ({ id: `${id}-${day}`, weekTypeId: id, day, intent: "Rest / recovery", workoutId: null, strengthTemplateId: null, progressionTrackId: null, locationId: null, priorityEmphasis: "balanced", category: "recovery", workoutKind: "recovery", details: "", isQualityIntent: false }));
      await db.insert(weekTypeDayIntents).values(rows);
      return Response.json({ ok: true, templateId: id });
    }

    if (action === "disableWeekType" || action === "deleteWeekType") {
      const templateId = asString(body.templateId);
      const [template] = await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, templateId)).limit(1);
      if (!template) return apiError("Week Type not found.", 404);
      if (template.isBuiltIn) return apiError("Built-in Week Types cannot be deleted.", 409);
      const refs = await db.select().from(plannedWeeks).where(eq(plannedWeeks.programmeWeekTypeId, templateId));
      if (action === "deleteWeekType" && refs.length) return apiError("This Week Type is used by programme history. Disable it instead.", 409);
      await db.update(weekTypeTemplates).set({ active: false, updatedAt: nowIso() }).where(eq(weekTypeTemplates.id, templateId));
      return Response.json({ ok: true, templateId, disabled: true });
    }

    if (action === "previewWeekTypePropagation") {
      const templateId = asString(body.templateId);
      const [template] = await db.select({ id: weekTypeTemplates.id }).from(weekTypeTemplates).where(eq(weekTypeTemplates.id, templateId)).limit(1);
      if (!template) return apiError("Week Type not found.", 404);
      const recommendations = await db.select({ weekId: programmeWeekRecommendations.weekId }).from(programmeWeekRecommendations).where(eq(programmeWeekRecommendations.weekTypeId, templateId));
      const weeks = recommendations.length ? await db.select().from(plannedWeeks).where(inArray(plannedWeeks.id, recommendations.map((row) => row.weekId))) : [];
      const candidates = weeks.filter((week) => week.startDate >= todayIso() && !week.confirmedAt && !["in_progress", "complete"].includes(week.status));
      const eligible = [] as typeof candidates;
      const protectedWeeks = weeks.filter((week) => !candidates.some((item) => item.id === week.id));
      const conflicts: string[] = [];
      for (const week of candidates) {
        const intents = await db.select().from(programmeWeekDayIntents).where(eq(programmeWeekDayIntents.weekId, week.id));
        const templateIntents = await db.select().from(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, templateId));
        const hasExplicitProgression = intents.some((intent) => intent.isProgrammeOverride && Boolean(intent.progressionTrackId));
        if (hasExplicitProgression && !templateIntents.some((intent) => intent.isQualityIntent)) conflicts.push(week.id);
        else eligible.push(week);
      }
      return Response.json({ ok: true, eligibleWeekIds: eligible.map((week) => week.id), eligibleCount: eligible.length, protectedCount: protectedWeeks.length, conflicts });
    }

    if (action === "updateFutureWeeksFromWeekType") {
      const templateId = asString(body.templateId);
      const [template] = await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, templateId)).limit(1);
      if (!template) return apiError("Week Type not found.", 404);
      const recommendations = await db.select().from(programmeWeekRecommendations).where(eq(programmeWeekRecommendations.weekTypeId, templateId));
      const weeks = await db.select().from(plannedWeeks).where(inArray(plannedWeeks.id, recommendations.map((row) => row.weekId)));
      const candidates = weeks.filter((week) => week.startDate >= todayIso() && !week.confirmedAt && !["in_progress", "complete"].includes(week.status));
      const templateIntents = await db.select().from(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, templateId));
      const eligible = [] as typeof candidates;
      for (const week of candidates) {
        const intents = await db.select().from(programmeWeekDayIntents).where(eq(programmeWeekDayIntents.weekId, week.id));
        const hasExplicitProgression = intents.some((intent) => intent.isProgrammeOverride && Boolean(intent.progressionTrackId));
        if (hasExplicitProgression && !templateIntents.some((intent) => intent.isQualityIntent)) continue;
        eligible.push(week);
      }
      for (const week of eligible) await applyWeekTypeTemplatePropagation(db, week.id, templateId);
      return Response.json({ ok: true, eligibleWeekIds: eligible.map((week) => week.id), eligibleCount: eligible.length });
    }

    if (action === "updateProgrammeWeek") {
      const weekId = asString(body.weekId);
      const [week] = await db.select().from(plannedWeeks).where(eq(plannedWeeks.id, weekId)).limit(1);
      if (!week) return apiError("Programme week not found.", 404);
      if (week.confirmedAt || week.status === "in_progress") return apiError("Set or in-progress weeks require normal Week editing.", 409);
      const previousRecommendation = await db.select().from(programmeWeekRecommendations).where(eq(programmeWeekRecommendations.weekId, weekId)).limit(1).then((rows) => rows[0]);
      const recommendation = { title: asString(body.title, week.title), rationale: asString(body.rationale, week.rationale), qualityIntent: asString(body.qualityIntent, week.qualityFocus), weekTypeId: asString(body.weekTypeId) || null, phaseId: asString(body.phaseId) || null, progressionTrackId: asString(body.progressionTrackId) || null };
      if (recommendation.weekTypeId && recommendation.weekTypeId !== previousRecommendation?.weekTypeId) await setProgrammeWeekType(db, weekId, recommendation.weekTypeId);
      const legacyWeekType = recommendation.weekTypeId?.startsWith("week-type-") ? recommendation.weekTypeId.slice("week-type-".length) : week.weekType;
      await db.update(plannedWeeks).set({ title: recommendation.title, rationale: recommendation.rationale, qualityFocus: recommendation.qualityIntent, weekType: legacyWeekType, programmeWeekTypeId: recommendation.weekTypeId, programmePhaseId: recommendation.phaseId, updatedAt: nowIso() }).where(eq(plannedWeeks.id, weekId));
      await db.insert(programmeWeekRecommendations).values({ id: `programme-recommendation-${weekId}`, weekId, ...recommendation, updatedAt: nowIso() }).onConflictDoUpdate({ target: programmeWeekRecommendations.weekId, set: { ...recommendation, updatedAt: nowIso() } });
      return Response.json({ ok: true });
    }

    if (action === "previewProgrammeWeek") {
      const weekId = asString(body.weekId);
      const [week] = await db.select().from(plannedWeeks).where(eq(plannedWeeks.id, weekId)).limit(1);
      if (!week) return apiError("Programme week not found.", 404);
      const recommendation = await db.select().from(programmeWeekRecommendations).where(eq(programmeWeekRecommendations.weekId, weekId)).limit(1).then((rows) => rows[0]);
      const hasDraftWeekType = Object.prototype.hasOwnProperty.call(body, "weekTypeId");
      const weekTypeId = asString(body.weekTypeId) || recommendation?.weekTypeId || `week-type-${week.weekType}`;
      const currentProgrammeIntents = await db.select().from(programmeWeekDayIntents).where(eq(programmeWeekDayIntents.weekId, weekId)).orderBy(asc(programmeWeekDayIntents.day));
      const selectedIntents = !hasDraftWeekType || weekTypeId === recommendation?.weekTypeId
        ? (currentProgrammeIntents.length ? currentProgrammeIntents : await db.select().from(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, weekTypeId)).orderBy(asc(weekTypeDayIntents.day)))
        : await db.select().from(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, weekTypeId)).orderBy(asc(weekTypeDayIntents.day));
      const progressionTrackId = Object.prototype.hasOwnProperty.call(body, "progressionTrackId") ? asString(body.progressionTrackId) : recommendation?.progressionTrackId ?? "";
      const qualityDay = selectedIntents.find((intent) => intent.isQualityIntent)?.day;
      const intents = selectedIntents.map((intent) => qualityDay === intent.day ? { ...intent, progressionTrackId: progressionTrackId || null } : { ...intent, progressionTrackId: null });
      const [weekType] = await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, weekTypeId)).limit(1);
      const rows = await resolveV2ProgrammeRows(db, week, intents, { defaultLocationId: weekType?.defaultLocationId ?? null, sharedProgression: true });
      return Response.json({ ok: true, days: rows.map((row) => ({ day: row.sortOrder, title: row.title, category: row.category, workoutKind: row.workoutKind, locationId: row.locationId, details: row.details, progressionTrackId: row.progressionTrackId, progressionStepId: row.progressionStepId })) });
    }

    if (action === "completeProgressionStep") {
      // The normal product path uses completeProgressionForSession below; its
      // Together response deliberately says "waiting for partner completion"
      // rather than advancing a shared track after one athlete.
      const trackId = asString(body.trackId);
      const [track] = await db.select().from(progressionTracks).where(eq(progressionTracks.id, trackId)).limit(1);
      if (!track) return apiError("Progression track not found.", 404);
      const [state] = await db.select().from(progressionStatesV2).where(and(eq(progressionStatesV2.athleteId, actor.id), eq(progressionStatesV2.trackId, trackId))).limit(1);
      const [stepCount] = await db.select({ count: sql<number>`count(*)` }).from(progressionSteps).where(eq(progressionSteps.trackId, trackId));
      const next = Math.min((state?.currentStep ?? 0) + 1, Number(stepCount?.count ?? 0));
      await db.insert(progressionStatesV2).values({ athleteId: actor.id, trackId, currentStep: next, togetherPending: false, updatedAt: nowIso() }).onConflictDoUpdate({ target: [progressionStatesV2.athleteId, progressionStatesV2.trackId], set: { currentStep: next, togetherPending: false, updatedAt: nowIso() } });
      return Response.json({ ok: true, currentStep: next });
    }

    if (action === "react") {
      const activityId = asString(body.activityId);
      const emoji = asString(body.emoji);
      if (!validReactions.has(emoji)) return apiError("Choose one of the available reactions.");
      const [item] = await db.select().from(activityFeedItems).where(eq(activityFeedItems.id, activityId)).limit(1);
      if (!item || item.teamId !== TEAM_ID) return apiError("Activity not found.", 404);
      const [existing] = await db
        .select()
        .from(reactions)
        .where(and(eq(reactions.activityId, activityId), eq(reactions.athleteId, actor.id)))
        .limit(1);
      if (existing?.emoji === emoji) {
        await db.delete(reactions).where(and(eq(reactions.activityId, activityId), eq(reactions.athleteId, actor.id)));
      } else {
        await db
          .insert(reactions)
          .values({ activityId, athleteId: actor.id, emoji })
          .onConflictDoUpdate({
            target: [reactions.activityId, reactions.athleteId],
            set: { emoji, createdAt: nowIso() },
          });
      }
      return Response.json({ ok: true });
    }

    if (action === "saveRaceReview") {
      const eventId = asString(body.eventId);
      const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!event) return apiError("Event not found.", 404);
      const stationTimes = body.stationTimes && typeof body.stationTimes === "object" ? body.stationTimes : {};
      const reflection = body.reflection && typeof body.reflection === "object" ? body.reflection : {};
      const sharedId = `review-${eventId}-team`;
      await db
        .insert(raceReviews)
        .values({
          id: sharedId,
          eventId,
          athleteKey: "team",
          reviewType: "shared",
          overallTime: asString(body.overallTime),
          averageRunPace: asString(body.averageRunPace),
          transitionTime: asString(body.transitionTime),
          stationTimesJson: JSON.stringify(stationTimes),
          reflectionJson: JSON.stringify(reflection),
          notes: asString(body.sharedNotes),
          updatedAt: nowIso(),
        })
        .onConflictDoUpdate({
          target: raceReviews.id,
          set: {
            overallTime: asString(body.overallTime),
            averageRunPace: asString(body.averageRunPace),
            transitionTime: asString(body.transitionTime),
            stationTimesJson: JSON.stringify(stationTimes),
            reflectionJson: JSON.stringify(reflection),
            notes: asString(body.sharedNotes),
            updatedAt: nowIso(),
          },
        });
      const athleteReviewId = `review-${eventId}-${actor.athleteKey}`;
      await db
        .insert(raceReviews)
        .values({
          id: athleteReviewId,
          eventId,
          athleteKey: actor.athleteKey,
          reviewType: "individual",
          rpe: clampScore(body.rpe),
          feel: clampScore(body.feel),
          notes: asString(body.personalNotes),
          updatedAt: nowIso(),
        })
        .onConflictDoUpdate({
          target: raceReviews.id,
          set: {
            rpe: clampScore(body.rpe),
            feel: clampScore(body.feel),
            notes: asString(body.personalNotes),
            updatedAt: nowIso(),
          },
        });
      await db.update(events).set({ status: "completed" }).where(eq(events.id, eventId));
      await createActivity(db, actor.id, "review", `${actor.displayName} updated the ${event.name} race review.`, eventId);
      return Response.json({ ok: true });
    }

    if (action === "viewDuoBase") {
      const templateId = asString(body.templateId);
      if (!templateId) return Response.json({ ok: true, reference: "DUO base programme" });
      const [template] = await db.select().from(weekTypeTemplates).where(eq(weekTypeTemplates.id, templateId)).limit(1);
      if (!template) return apiError("Week Type not found.", 404);
      let base: Record<string, unknown> = {};
      try { base = JSON.parse(template.baseJson || "{}"); } catch { base = {}; }
      const intents = await db.select().from(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, templateId)).orderBy(asc(weekTypeDayIntents.day));
      return Response.json({ ok: true, template: { ...template, name: asString(base.name, template.name), rationale: asString(base.rationale, template.rationale), hardTarget: Number(base.hardTarget ?? template.hardTarget), strengthTarget: Number(base.strengthTarget ?? template.strengthTarget), easyTarget: Number(base.easyTarget ?? template.easyTarget), defaultLocationId: typeof base.defaultLocationId === "string" ? base.defaultLocationId : null, priorityEmphasis: asString(base.priorityEmphasis, template.priorityEmphasis), active: base.active !== false, intents: Array.isArray(base.intents) && base.intents.length === 7 ? base.intents : intents } });
    }

    if (action === "viewProgrammeSnapshot") {
      const weekId = asString(body.weekId);
      const [week] = await db.select({ id: plannedWeeks.id, programmeSnapshotJson: plannedWeeks.programmeSnapshotJson, confirmedAt: plannedWeeks.confirmedAt, status: plannedWeeks.status }).from(plannedWeeks).where(eq(plannedWeeks.id, weekId)).limit(1);
      if (!week) return apiError("Programme week not found.", 404);
      let snapshot: Record<string, unknown> = {};
      try { snapshot = JSON.parse(week.programmeSnapshotJson || "{}"); } catch { snapshot = {}; }
      return Response.json({ ok: true, snapshot, confirmedAt: week.confirmedAt, status: week.status });
    }

    if (action === "resetWeekTypeTemplate") {
      const templateId = asString(body.templateId);
      const [template] = await db.select().from(weekTypeTemplates).where(and(eq(weekTypeTemplates.id, templateId), eq(weekTypeTemplates.isBuiltIn, true))).limit(1);
      if (!template) return apiError("Only a built-in Week Type can be reset.", 404);
      let base: Record<string, unknown> = {};
      try { base = JSON.parse(template.baseJson || "{}"); } catch { base = {}; }
      const baseIntents = Array.isArray(base.intents) ? base.intents as Array<Record<string, unknown>> : [];
      if (baseIntents.length !== 7) return apiError("The DUO base for this Week Type is incomplete.", 409);
      const rows = baseIntents.map((item, index) => ({ id: `${templateId}-${asNumber(item.day, index)}`, weekTypeId: templateId, day: asNumber(item.day, index) as number, intent: asString(item.intent, "Rest / recovery"), workoutId: asString(item.workoutId) || null, strengthTemplateId: asString(item.strengthTemplateId) || null, progressionTrackId: asString(item.progressionTrackId) || null, locationId: asString(item.locationId) || null, priorityEmphasis: asString(item.priorityEmphasis, "balanced"), category: asString(item.category, "recovery"), workoutKind: asString(item.workoutKind, "recovery"), details: asString(item.details), isQualityIntent: Boolean(item.isQualityIntent) }));
      await db.update(weekTypeTemplates).set({ name: asString(base.name, template.name), rationale: asString(base.rationale, template.rationale), hardTarget: Math.max(0, Math.round(asNumber(base.hardTarget, template.hardTarget) ?? template.hardTarget)), strengthTarget: Math.max(0, Math.round(asNumber(base.strengthTarget, template.strengthTarget) ?? template.strengthTarget)), easyTarget: Math.max(0, Math.round(asNumber(base.easyTarget, template.easyTarget) ?? template.easyTarget)), defaultLocationId: typeof base.defaultLocationId === "string" ? base.defaultLocationId : null, priorityEmphasis: asString(base.priorityEmphasis, template.priorityEmphasis), active: base.active !== false, updatedAt: nowIso() }).where(eq(weekTypeTemplates.id, templateId));
      await db.delete(weekTypeDayIntents).where(eq(weekTypeDayIntents.weekTypeId, templateId));
      for (const batch of d1InsertBatches(rows)) await db.insert(weekTypeDayIntents).values(batch);
      return Response.json({ ok: true, templateId });
    }

    if (action === "updateBlock") {
      const blockId = asString(body.blockId);
      const [block] = await db.select().from(trainingBlocks).where(eq(trainingBlocks.id, blockId)).limit(1);
      if (!block) return apiError("Training block not found.", 404);
      const startDate = asString(body.startDate, block.startDate);
      const endDate = asString(body.endDate, block.endDate);
      if (!asString(body.name, block.name) || startDate > endDate) return apiError("Block name and valid dates are required.");
      const phasesOutside = await db.select().from(trainingPhases).where(and(eq(trainingPhases.blockId, blockId), sql`${trainingPhases.startDate} < ${startDate} or ${trainingPhases.endDate} > ${endDate}`));
      if (phasesOutside.length) return apiError("Update the affected phase dates before shortening this block.", 409);
      const phases = await db.select().from(trainingPhases).where(eq(trainingPhases.blockId, blockId));
      const coverageError = phaseCoverageError(phases, { startDate, endDate });
      if (coverageError) return apiError(coverageError, 422);
      await db.update(trainingBlocks).set({ name: asString(body.name, block.name), startDate, endDate, trainingGoal: asString(body.trainingGoal, block.trainingGoal), notes: asString(body.notes, block.notes) }).where(eq(trainingBlocks.id, blockId));
      return Response.json({ ok: true });
    }

    if (action === "createPhase" || action === "updatePhase") {
      const phaseId = asString(body.phaseId);
      const existing = phaseId ? await db.select().from(trainingPhases).where(eq(trainingPhases.id, phaseId)).limit(1).then((rows) => rows[0]) : null;
      const blockId = asString(body.blockId, existing?.blockId ?? "");
      const [block] = await db.select().from(trainingBlocks).where(eq(trainingBlocks.id, blockId)).limit(1);
      if (!block) return apiError("Training block not found.", 404);
      const name = asString(body.name, existing?.name ?? "");
      const startDate = asString(body.startDate, existing?.startDate ?? "");
      const endDate = asString(body.endDate, existing?.endDate ?? "");
      if (!name || !startDate || !endDate || startDate > endDate || startDate < block.startDate || endDate > block.endDate) return apiError("Use valid phase dates inside the training block.");
      const overlapping = await db.select().from(trainingPhases).where(and(eq(trainingPhases.blockId, blockId), sql`${trainingPhases.startDate} <= ${endDate} and ${trainingPhases.endDate} >= ${startDate}`));
      if (overlapping.some((phase) => phase.id !== existing?.id)) return apiError("Phase dates cannot overlap another phase.", 409);
      const id = existing?.id ?? `phase-${crypto.randomUUID()}`;
      const values = { blockId, name, startDate, endDate, focus: asString(body.focus, existing?.focus ?? ""), sortOrder: Math.max(0, Math.round(asNumber(body.sortOrder, existing?.sortOrder ?? (await db.select({ count: sql<number>`count(*)` }).from(trainingPhases).where(eq(trainingPhases.blockId, blockId)))[0]?.count ?? 0) ?? 0)) };
      if (existing) await db.update(trainingPhases).set(values).where(eq(trainingPhases.id, id)); else await db.insert(trainingPhases).values({ id, ...values });
      const allPhases = await db.select().from(trainingPhases).where(eq(trainingPhases.blockId, blockId));
      const coverageError = phaseCoverageError(allPhases, block);
      if (coverageError) {
        if (existing) await db.update(trainingPhases).set({ name: existing.name, startDate: existing.startDate, endDate: existing.endDate, focus: existing.focus, sortOrder: existing.sortOrder }).where(eq(trainingPhases.id, id));
        else await db.delete(trainingPhases).where(eq(trainingPhases.id, id));
        return apiError(coverageError, 422);
      }
      // Phase dates are the programme order. Recalculate only editable future
      // recommendations, never snapshots or historical weeks.
      const phases = allPhases.sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (const [index, phase] of phases.entries()) await db.update(trainingPhases).set({ sortOrder: index }).where(eq(trainingPhases.id, phase.id));
      const futureWeeks = await db.select().from(plannedWeeks).where(and(eq(plannedWeeks.blockId, blockId), isNull(plannedWeeks.confirmedAt), sql`${plannedWeeks.status} not in ('in_progress', 'complete')`));
      for (const week of futureWeeks) {
        const resolved = phases.find((phase) => phase.startDate <= week.startDate && phase.endDate >= week.startDate) ?? null;
        await db.update(programmeWeekRecommendations).set({ phaseId: resolved?.id ?? null, updatedAt: nowIso() }).where(eq(programmeWeekRecommendations.weekId, week.id));
        await db.update(plannedWeeks).set({ programmePhaseId: resolved?.id ?? null, updatedAt: nowIso() }).where(eq(plannedWeeks.id, week.id));
      }
      return Response.json({ ok: true, phaseId: id });
    }

    if (action === "deletePhase") {
      const phaseId = asString(body.phaseId);
      const [phase] = await db.select().from(trainingPhases).where(eq(trainingPhases.id, phaseId)).limit(1);
      if (!phase) return apiError("Phase not found.", 404);
      const protectedWeeks = await db.select().from(plannedWeeks).where(and(eq(plannedWeeks.blockId, phase.blockId), sql`${plannedWeeks.startDate} between ${phase.startDate} and ${phase.endDate}`, sql`${plannedWeeks.confirmedAt} is not null or ${plannedWeeks.status} in ('in_progress', 'complete')`));
      if (protectedWeeks.length) return apiError("This phase contains Set or historical weeks. Reassign eligible future weeks instead.", 409);
      const remaining = await db.select().from(trainingPhases).where(and(eq(trainingPhases.blockId, phase.blockId), sql`${trainingPhases.id} != ${phase.id}`));
      const [block] = await db.select().from(trainingBlocks).where(eq(trainingBlocks.id, phase.blockId)).limit(1);
      if (block) {
        const coverageError = phaseCoverageError(remaining, block);
        if (coverageError) return apiError(coverageError, 422);
      }
      await db.update(programmeWeekRecommendations).set({ phaseId: null, updatedAt: nowIso() }).where(eq(programmeWeekRecommendations.phaseId, phaseId));
      await db.delete(trainingPhases).where(eq(trainingPhases.id, phaseId));
      const remainingAfterDelete = await db.select().from(trainingPhases).where(eq(trainingPhases.blockId, phase.blockId)).orderBy(asc(trainingPhases.startDate));
      for (const [index, item] of remainingAfterDelete.entries()) await db.update(trainingPhases).set({ sortOrder: index }).where(eq(trainingPhases.id, item.id));
      const futureWeeks = await db.select().from(plannedWeeks).where(and(eq(plannedWeeks.blockId, phase.blockId), isNull(plannedWeeks.confirmedAt), sql`${plannedWeeks.status} not in ('in_progress', 'complete')`));
      for (const week of futureWeeks) {
        const resolved = remainingAfterDelete.find((item) => item.startDate <= week.startDate && item.endDate >= week.startDate) ?? null;
        await db.update(programmeWeekRecommendations).set({ phaseId: resolved?.id ?? null, updatedAt: nowIso() }).where(eq(programmeWeekRecommendations.weekId, week.id));
        await db.update(plannedWeeks).set({ programmePhaseId: resolved?.id ?? null, updatedAt: nowIso() }).where(eq(plannedWeeks.id, week.id));
      }
      return Response.json({ ok: true });
    }

    if (action === "createBlock") {
      const name = asString(body.name);
      const startDate = asString(body.startDate);
      const endDate = asString(body.endDate);
      const eventName = asString(body.eventName);
      const eventDate = asString(body.eventDate);
      if (!name || !startDate || !endDate || !eventName || !eventDate) {
        return apiError("Block name, dates and event details are required.");
      }
      if (startDate > endDate || eventDate < startDate || eventDate > endDate) {
        return apiError("The event must fall inside the training block dates.");
      }
      if (daysBetween(startDate, endDate) < 20) {
        return apiError("Use a training block of at least three weeks so its phases remain meaningful.");
      }
      const blockId = `block-${crypto.randomUUID()}`;
      const eventId = `event-${crypto.randomUUID()}`;
      await db.insert(trainingBlocks).values({
        id: blockId,
        teamId: TEAM_ID,
        name,
        startDate,
        endDate,
        trainingGoal: asString(body.trainingGoal),
        status: startDate <= todayIso() ? "active" : "upcoming",
        notes: asString(body.notes),
      });
      const totalDays = Math.max(7, daysBetween(startDate, endDate));
      const taperDays = Math.min(14, Math.max(7, Math.round(totalDays * 0.15)));
      const specificStart = addDays(startDate, Math.max(7, Math.round(totalDays * 0.45)));
      const taperStart = addDays(endDate, -taperDays);
      await db.insert(trainingPhases).values([
        {
          id: `phase-${crypto.randomUUID()}`,
          blockId,
          name: "Foundation",
          startDate,
          endDate: addDays(specificStart, -1),
          focus: "Build durable aerobic and strength foundations.",
          sortOrder: 1,
        },
        {
          id: `phase-${crypto.randomUUID()}`,
          blockId,
          name: "Specific Build",
          startDate: specificStart,
          endDate: addDays(taperStart, -1),
          focus: "Progress the block's priority workouts and event specificity.",
          sortOrder: 2,
        },
        {
          id: `phase-${crypto.randomUUID()}`,
          blockId,
          name: "Taper",
          startDate: taperStart,
          endDate,
          focus: "Reduce fatigue while maintaining sharpness.",
          sortOrder: 3,
        },
      ]);
      await db.insert(events).values({
        id: eventId,
        blockId,
        name: eventName,
        eventDate,
        location: asString(body.eventLocation),
        eventType: asString(body.eventType, "Race"),
        raceFormat: asString(body.raceFormat),
        partner: asString(body.partner),
        priority: asString(body.priority, "A"),
        label: "Target event",
        notes: asString(body.eventNotes),
        status: "upcoming",
      });
      await createActivity(db, actor.id, "block", `${actor.displayName} created the ${name} training block.`, blockId);
      return Response.json({ ok: true, blockId, eventId });
    }

    if (action === "updateSettings") {
      const displayName = asString(body.displayName, actor.displayName);
      const loadIncrementKg = Math.max(0.5, asNumber(body.loadIncrementKg, actor.loadIncrementKg) ?? actor.loadIncrementKg);
      const preferredDays = Array.isArray(body.preferredDays)
        ? body.preferredDays.filter((day): day is string => typeof day === "string")
        : parseJson<string[]>(actor.preferredDaysJson, []);
      const requestedTitleBarColor = asString(body.titleBarColor, actor.titleBarColor).toLowerCase();
      const titleBarColor = validTitleBarColors.has(requestedTitleBarColor)
        ? requestedTitleBarColor
        : actor.titleBarColor;
      await db
        .update(athletes)
        .set({
          displayName,
          loadIncrementKg,
          preferredDaysJson: JSON.stringify(preferredDays),
          titleBarColor,
          updatedAt: nowIso(),
        })
        .where(eq(athletes.id, actor.id));
      return Response.json({ ok: true });
    }

    return apiError("Unknown action.", 404);
  } catch (error) {
    console.error("Unable to save training data", error);
    return apiError("The change could not be saved. Please try again.", 500);
  }
}
