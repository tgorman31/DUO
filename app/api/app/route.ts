import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
} from "drizzle-orm";
import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { ensureSeeded, rebuildWeekSessions, resetTrainingData, type TrainingDb } from "@/db/seed";
import {
  reconcileRecommendedWeek,
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
} from "@/db/schema";
import {
  addDays,
  TEAM_ID,
  WEEK_TYPE_INFO,
  workoutTemplateIdForSession,
} from "@/lib/training-data";
import { calculateProgression, categoryTotals } from "@/lib/training-logic";

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
      .filter((slot) => slot.workoutKind === workoutKind)
      .map((slot) => {
        const baseSetting = settingFor(actor.id, slot.defaultExerciseId);
        const approved = parseJson<string[]>(baseSetting?.approvedAlternativesJson ?? "[]", []);
        const rawOptions = alternativeRows.filter((option) => option.slotId === slot.id);
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
  const weekWithState = weeksWithState.find((item) => item.id === week.id) ?? {
    ...week,
    planningState: planningStateFor(week, sessionRows, today),
  };
  const eventData = eventRows.map((event) => ({
    ...event,
    daysAway: daysBetween(today, event.eventDate),
  }));
  const partner = athleteRows.find((athlete) => athlete.id !== actor.id) ?? null;

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
      await reconcileRecommendedWeek(db, week, true);
      const confirmedAt = nowIso();
      await db
        .update(plannedWeeks)
        .set({ confirmedAt, status: "set", updatedAt: confirmedAt })
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
      const info = WEEK_TYPE_INFO[weekType];
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

      const progressionMessages: string[] = [];
      if (action === "completeStrength") {
        const entries = Array.isArray(body.exercises) ? body.exercises : [];
        if (!entries.length) return apiError("Log at least one strength exercise.");
        const oldPerformances = await db
          .select({ id: exercisePerformances.id })
          .from(exercisePerformances)
          .where(eq(exercisePerformances.resultId, resultId));
        if (oldPerformances.length) {
          await db.delete(strengthSets).where(inArray(strengthSets.performanceId, oldPerformances.map((item) => item.id)));
          await db.delete(exercisePerformances).where(eq(exercisePerformances.resultId, resultId));
        }

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
          if (!slotId || !exerciseId || !parsedSets.length) continue;

          const [slot, exercise, existingState, exerciseSetting] = await Promise.all([
            db.select().from(strengthSlots).where(eq(strengthSlots.id, slotId)).limit(1).then((rows) => rows[0]),
            db.select().from(exercises).where(eq(exercises.id, exerciseId)).limit(1).then((rows) => rows[0]),
            db
              .select()
              .from(progressionStates)
              .where(and(eq(progressionStates.athleteId, actor.id), eq(progressionStates.exerciseId, exerciseId)))
              .limit(1)
              .then((rows) => rows[0]),
            db
              .select()
              .from(athleteExerciseSettings)
              .where(
                and(
                  eq(athleteExerciseSettings.athleteId, actor.id),
                  eq(athleteExerciseSettings.exerciseId, exerciseId),
                ),
              )
              .limit(1)
              .then((rows) => rows[0]),
          ]);
          if (!slot || !exercise) continue;
          const workingLoadKg = Math.max(...parsedSets.map((set) => set.weightKg));
          const performanceId = `performance-${resultId}-${slotId}`;
          await db.insert(exercisePerformances).values({
            id: performanceId,
            resultId,
            athleteId: actor.id,
            exerciseId,
            slotId,
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
              exerciseId,
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

      await db
        .update(athleteSessions)
        .set({ status: "completed", completedAt: nowIso(), updatedAt: nowIso() })
        .where(eq(athleteSessions.id, sessionRow.id));
      await db
        .update(plannedWeeks)
        .set({ status: "in_progress", updatedAt: nowIso() })
        .where(eq(plannedWeeks.id, sessionRow.weekId));
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
