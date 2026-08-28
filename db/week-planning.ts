import { eq } from "drizzle-orm";
import type { TrainingDb } from "./seed";
import { athleteSessions, plannedWeeks, sharedSessions } from "./schema";
import {
  addDays,
  scheduleForWeek,
  WEEK_TYPE_INFO,
  workoutTemplateIdForSession,
} from "@/lib/training-data";

type WeekPlanBasis = {
  id: string;
  startDate: string;
  weekType: string;
  qualityFocus: string;
};

const ATHLETE_IDS = ["thomas", "kt"] as const;

function recommendedSharedRows(week: WeekPlanBasis) {
  return scheduleForWeek(week).map((item) => ({
    id: `shared-${week.id}-${item.day}`,
    weekId: week.id,
    scheduledDate: addDays(week.startDate, item.day),
    title: item.title,
    category: item.category,
    workoutKind: item.workoutKind,
    details: item.details,
    workoutTemplateId: workoutTemplateIdForSession(item.title, item.workoutKind),
    assignment: "together",
    sortOrder: item.day,
  }));
}

/**
 * Reconciles the seven recommended shared slots without touching completed
 * athlete sessions. When activate is false, every remaining uncompleted row is
 * kept as a recoverable database record but removed from the active plan.
 */
export async function reconcileRecommendedWeek(
  db: TrainingDb,
  week: WeekPlanBasis,
  activate: boolean,
) {
  const now = new Date().toISOString();
  const sharedRows = recommendedSharedRows(week);
  const currentAthleteRows = await db
    .select()
    .from(athleteSessions)
    .where(eq(athleteSessions.weekId, week.id));
  const desiredAthleteIds = new Set<string>();

  for (const row of sharedRows) {
    await db
      .insert(sharedSessions)
      .values(row)
      .onConflictDoUpdate({
        target: sharedSessions.id,
        set: {
          scheduledDate: row.scheduledDate,
          title: row.title,
          category: row.category,
          workoutKind: row.workoutKind,
          details: row.details,
          workoutTemplateId: row.workoutTemplateId,
          assignment: row.assignment,
          sortOrder: row.sortOrder,
          updatedAt: now,
        },
      });

    for (const athleteId of ATHLETE_IDS) {
      const id = `session-${athleteId}-${week.id}-${row.sortOrder}`;
      desiredAthleteIds.add(id);
      const existing = currentAthleteRows.find((item) => item.id === id);
      if (existing?.status === "completed") continue;

      const values = {
        id,
        weekId: week.id,
        sharedSessionId: row.id,
        athleteId,
        scheduledDate: row.scheduledDate,
        title: row.title,
        category: row.category,
        workoutKind: row.workoutKind,
        details: row.details,
        workoutTemplateId: row.workoutTemplateId,
        assignment: "together",
        status: activate ? "planned" : "removed",
        completedAt: null,
        sortOrder: row.sortOrder,
        updatedAt: now,
      };

      if (existing) {
        await db
          .update(athleteSessions)
          .set(values)
          .where(eq(athleteSessions.id, id));
      } else {
        await db.insert(athleteSessions).values(values);
      }
    }
  }

  for (const row of currentAthleteRows) {
    if (row.status === "completed" || desiredAthleteIds.has(row.id)) continue;
    await db
      .update(athleteSessions)
      .set({ status: "removed", assignment: "individual", updatedAt: now })
      .where(eq(athleteSessions.id, row.id));
  }

  return sharedRows;
}

export async function unsetWeekPlanningState(db: TrainingDb, week: WeekPlanBasis) {
  const currentRows = await db
    .select()
    .from(athleteSessions)
    .where(eq(athleteSessions.weekId, week.id));
  const preservedCompleted = currentRows.filter((row) => row.status === "completed");
  const defaults = WEEK_TYPE_INFO[week.weekType]?.targets ?? {
    hard: 0,
    strength: 0,
    easy: 0,
  };

  await reconcileRecommendedWeek(db, week, false);
  await db
    .update(plannedWeeks)
    .set({
      confirmedAt: null,
      status: "recommended",
      hardTarget: defaults.hard,
      strengthTarget: defaults.strength,
      easyTarget: defaults.easy,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(plannedWeeks.id, week.id));

  return preservedCompleted;
}
