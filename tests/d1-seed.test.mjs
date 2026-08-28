import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import "tsx";
import * as schema from "../db/schema.ts";

const { ensureSeeded } = await import("../db/seed.ts");
const { reconcileRecommendedWeek, unsetWeekPlanningState } = await import("../db/week-planning.ts");

const migrationsUrl = new URL("../drizzle/", import.meta.url);

async function migrationFiles() {
  return (await readdir(migrationsUrl))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

async function applyMigration(binding, name) {
  const migration = await readFile(new URL(name, migrationsUrl), "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await binding.batch(statements.map((statement) => binding.prepare(statement)));
}

test("the complete training database seed fits D1 and is idempotent", async () => {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });

  try {
    const binding = await miniflare.getD1Database("DB");
    for (const migration of await migrationFiles()) {
      await applyMigration(binding, migration);
    }

    const db = drizzle(binding, { schema });
    await ensureSeeded(db);
    await ensureSeeded(db);

    const expectedCounts = {
      activity_feed_items: 2,
      app_metadata: 1,
      athlete_sessions: 182,
      athletes: 2,
      exercises: 36,
      planned_weeks: 13,
      shared_sessions: 91,
      strength_slots: 14,
      training_blocks: 1,
      training_phases: 6,
      training_teams: 1,
      workout_library_items: 12,
    };

    for (const [table, expected] of Object.entries(expectedCounts)) {
      const row = await binding
        .prepare(`select count(*) as count from ${table}`)
        .first();
      assert.equal(Number(row?.count), expected, table);
    }

    const vo2 = await binding
      .prepare("select purpose, warm_up, main_set, recovery, intensity_guidance, cool_down from workout_library_items where id = ?")
      .bind("lib-vo2-6x3")
      .first();
    assert.match(String(vo2?.purpose), /VO.? capacity/i);
    assert.match(String(vo2?.warm_up), /10.15 min/i);
    assert.match(String(vo2?.main_set), /6 . 3 min/i);
    assert.match(String(vo2?.recovery), /2 min/i);
    assert.match(String(vo2?.intensity_guidance), /8.9 (?:\/|of) 10/i);
    assert.match(String(vo2?.cool_down), /10 min/i);
  } finally {
    await miniflare.dispose();
  }
});

test("v1.1 migrations preserve legacy plans and submitted results", async () => {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });

  try {
    const binding = await miniflare.getD1Database("DB");
    const migrations = await migrationFiles();
    await applyMigration(binding, migrations[0]);

    await binding.exec(`
      INSERT INTO training_teams (id, name) VALUES ('legacy-team', 'Legacy Duo');
      INSERT INTO athletes (id, team_id, athlete_key, display_name) VALUES ('legacy-athlete', 'legacy-team', 'legacy', 'Legacy');
      INSERT INTO training_blocks (id, team_id, name, start_date, end_date) VALUES ('legacy-block', 'legacy-team', 'Legacy block', '2026-01-01', '2026-01-31');
      INSERT INTO planned_weeks (id, block_id, start_date, title, week_type) VALUES ('legacy-week', 'legacy-block', '2026-01-05', 'Legacy week', 'normal');
      INSERT INTO shared_sessions (id, week_id, scheduled_date, title, category, workout_kind) VALUES ('legacy-shared', 'legacy-week', '2026-01-05', 'Legacy run', 'hard', 'run');
      INSERT INTO athlete_sessions (id, week_id, shared_session_id, athlete_id, scheduled_date, title, category, workout_kind, status) VALUES ('legacy-session', 'legacy-week', 'legacy-shared', 'legacy-athlete', '2026-01-05', 'Legacy run', 'hard', 'run', 'completed');
      INSERT INTO workout_library_items (id, name, family, category, prescription, purpose) VALUES ('legacy-template', 'Legacy intervals', 'Running', 'hard', '4 x 4 min', 'Legacy purpose');
      INSERT INTO workout_results (id, session_id, athlete_id, completed_date, rpe, feel, average_pace, notes) VALUES ('legacy-result', 'legacy-session', 'legacy-athlete', '2026-01-05', 8, 7, '4:12', 'Genuine historical result');
    `);

    for (const migration of migrations.slice(1)) {
      await applyMigration(binding, migration);
    }

    const preserved = await binding
      .prepare(`
        SELECT s.status, r.rpe, r.feel, r.average_pace, r.notes,
          w.name, w.purpose, w.warm_up, w.owner_athlete_id,
          a.title_bar_color
        FROM athlete_sessions s
        JOIN workout_results r ON r.session_id = s.id
        JOIN workout_library_items w ON w.id = 'legacy-template'
        JOIN athletes a ON a.id = s.athlete_id
        WHERE s.id = 'legacy-session'
      `)
      .first();
    assert.deepEqual(
      {
        status: preserved?.status,
        rpe: Number(preserved?.rpe),
        feel: Number(preserved?.feel),
        averagePace: preserved?.average_pace,
        notes: preserved?.notes,
        name: preserved?.name,
        purpose: preserved?.purpose,
        warmUp: preserved?.warm_up,
        owner: preserved?.owner_athlete_id,
        titleBarColor: preserved?.title_bar_color,
      },
      {
        status: "completed",
        rpe: 8,
        feel: 7,
        averagePace: "4:12",
        notes: "Genuine historical result",
        name: "Legacy intervals",
        purpose: "Legacy purpose",
        warmUp: "",
        owner: null,
        titleBarColor: "#000080",
      },
    );
  } finally {
    await miniflare.dispose();
  }
});

test("v1.2 unset preserves completed history and removes only the active future plan", async () => {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });

  try {
    const binding = await miniflare.getD1Database("DB");
    for (const migration of await migrationFiles()) {
      await applyMigration(binding, migration);
    }
    const db = drizzle(binding, { schema });
    await ensureSeeded(db);

    const weekId = "week-2026-09-21";
    const completedSessionId = `session-thomas-${weekId}-0`;
    await binding
      .prepare("UPDATE planned_weeks SET confirmed_at = ?, status = 'set', hard_target = 3 WHERE id = ?")
      .bind("2026-09-20T18:00:00.000Z", weekId)
      .run();
    await binding
      .prepare("UPDATE athlete_sessions SET status = 'completed', completed_at = ? WHERE id = ?")
      .bind("2026-09-21T08:30:00.000Z", completedSessionId)
      .run();
    await binding
      .prepare("INSERT INTO workout_results (id, session_id, athlete_id, completed_date, rpe, feel, notes) VALUES (?, ?, 'thomas', '2026-09-21', 8, 7, ?)")
      .bind("result-v12-preserved", completedSessionId, "Genuine v1.2 history")
      .run();
    await binding.batch([
      binding.prepare("INSERT INTO shared_sessions (id, week_id, scheduled_date, title, category, workout_kind, sort_order) VALUES ('shared-v12-custom', ?, '2026-09-26', 'Custom sled', 'hard', 'hyrox', 99)").bind(weekId),
      binding.prepare("INSERT INTO athlete_sessions (id, week_id, shared_session_id, athlete_id, scheduled_date, title, category, workout_kind, status, sort_order) VALUES ('session-v12-custom-thomas', ?, 'shared-v12-custom', 'thomas', '2026-09-26', 'Custom sled', 'hard', 'hyrox', 'planned', 99)").bind(weekId),
      binding.prepare("INSERT INTO athlete_sessions (id, week_id, shared_session_id, athlete_id, scheduled_date, title, category, workout_kind, status, sort_order) VALUES ('session-v12-custom-kt', ?, 'shared-v12-custom', 'kt', '2026-09-26', 'Custom sled', 'hard', 'hyrox', 'planned', 99)").bind(weekId),
    ]);

    const [week] = await db.select().from(schema.plannedWeeks).where(eq(schema.plannedWeeks.id, weekId)).limit(1);
    assert.ok(week);
    const preserved = await unsetWeekPlanningState(db, week);
    assert.equal(preserved.length, 1);
    assert.equal(preserved[0].id, completedSessionId);

    const unsetWeek = await binding
      .prepare("SELECT confirmed_at, status, hard_target, strength_target, easy_target FROM planned_weeks WHERE id = ?")
      .bind(weekId)
      .first();
    assert.deepEqual(
      {
        confirmedAt: unsetWeek?.confirmed_at,
        status: unsetWeek?.status,
        hard: Number(unsetWeek?.hard_target),
        strength: Number(unsetWeek?.strength_target),
        easy: Number(unsetWeek?.easy_target),
      },
      { confirmedAt: null, status: "recommended", hard: 2, strength: 2, easy: 2 },
    );

    const result = await binding
      .prepare("SELECT s.status, s.completed_at, r.rpe, r.feel, r.notes FROM athlete_sessions s JOIN workout_results r ON r.session_id = s.id WHERE s.id = ?")
      .bind(completedSessionId)
      .first();
    assert.deepEqual(
      {
        status: result?.status,
        completedAt: result?.completed_at,
        rpe: Number(result?.rpe),
        feel: Number(result?.feel),
        notes: result?.notes,
      },
      {
        status: "completed",
        completedAt: "2026-09-21T08:30:00.000Z",
        rpe: 8,
        feel: 7,
        notes: "Genuine v1.2 history",
      },
    );
    const activeFuture = await binding
      .prepare("SELECT count(*) AS count FROM athlete_sessions WHERE week_id = ? AND status = 'planned'")
      .bind(weekId)
      .first();
    assert.equal(Number(activeFuture?.count), 0);

    await reconcileRecommendedWeek(db, week, true);
    const reactivated = await binding
      .prepare("SELECT count(*) AS count FROM athlete_sessions WHERE week_id = ? AND status = 'planned' AND sort_order < 90")
      .bind(weekId)
      .first();
    assert.equal(Number(reactivated?.count), 13);
    const custom = await binding
      .prepare("SELECT status FROM athlete_sessions WHERE id = 'session-v12-custom-thomas'")
      .first();
    assert.equal(custom?.status, "removed");
  } finally {
    await miniflare.dispose();
  }
});
