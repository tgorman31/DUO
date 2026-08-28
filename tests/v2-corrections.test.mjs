import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { Miniflare } from "miniflare";
import "tsx";
import * as schema from "../db/schema.ts";

const { ensureSeeded, resetTrainingData, LEGACY_SLOT_FOCUS_MAP, LEGACY_CATALOGUE_ALIAS_MAP } = await import("../db/seed.ts");
const { reconcileV2RecommendedWeek } = await import("../db/week-planning.ts");
const { completeStrengthEntries } = await import("../lib/strength-completion.ts");
const { cloneStrengthTemplate } = await import("../lib/strength-template.ts");
const { exerciseAvailable } = await import("../lib/equipment.ts");

async function applyMigrations(binding) {
  const directory = new URL("../drizzle/", import.meta.url);
  for (const name of (await readdir(directory)).filter((item) => /^\d{4}_.+\.sql$/.test(item)).sort()) {
    const sqlText = await readFile(new URL(name, directory), "utf8");
    await binding.batch(sqlText.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean).map((statement) => binding.prepare(statement)));
  }
}

async function seededDb() {
  const miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok') } }", d1Databases: ["DB"] });
  const binding = await miniflare.getD1Database("DB");
  await applyMigrations(binding);
  const db = drizzle(binding, { schema });
  await ensureSeeded(db);
  return { miniflare, binding, db };
}

test("all catalogue exercises and A/B slots resolve to history-compatible rows", async () => {
  const { miniflare, db } = await seededDb();
  try {
    const catalogue = await db.select().from(schema.catalogueExercises);
    const legacy = await db.select().from(schema.exercises);
    assert.equal(catalogue.length, 92);
    assert.ok(catalogue.every((exercise) => legacy.some((row) => row.catalogueId === exercise.id)));
    const slots = await db.select().from(schema.strengthSlots).where(sql`id like 'v2-%'`);
    const focusSlots = await db.select().from(schema.strengthFocusSlots).where(sql`id like 'v2-%'`);
    const legacyA = await db.select().from(schema.strengthSlots).where(eq(schema.strengthSlots.workoutKind, "strength-a"));
    const legacyB = await db.select().from(schema.strengthSlots).where(eq(schema.strengthSlots.workoutKind, "strength-b"));
    assert.equal(legacyA.filter((slot) => !slot.id.startsWith("v2-")).length, 7, "Strength A exposes exactly seven V1 history slots");
    assert.equal(legacyB.filter((slot) => !slot.id.startsWith("v2-")).length, 7, "Strength B exposes exactly seven V1 history slots");
    assert.equal(slots.length, 14);
    assert.equal(focusSlots.length, 14);
    for (const [slotId, focusId] of Object.entries(LEGACY_SLOT_FOCUS_MAP)) {
      const row = focusSlots.find((slot) => slot.id === `v2-${slotId}`);
      assert.equal(row?.focusId, focusId, slotId);
    }
    assert.equal(focusSlots.find((slot) => slot.id === "v2-a-hamstrings")?.focusId, "focus-ham-curl");
    assert.ok(focusSlots.every((slot) => slot.historySlotId && slots.some((history) => history.id === slot.historySlotId)));
    const hamstringsAlternatives = await db.select({ name: schema.exercises.name }).from(schema.slotAlternatives).innerJoin(schema.exercises, eq(schema.exercises.id, schema.slotAlternatives.exerciseId)).where(eq(schema.slotAlternatives.slotId, "a-hamstrings"));
    assert.ok(hamstringsAlternatives.every(({ name }) => !/rdl|romanian deadlift|hip hinge/i.test(name)), "Hamstring alternatives must not include RDL variants");
  } finally { await miniflare.dispose(); }
});

test("catalogue-only custom strength exercise resolves to a stable history identity", async () => {
  const { miniflare, db } = await seededDb();
  try {
    const [catalogue] = await db.select().from(schema.catalogueExercises).where(sql`legacy_exercise_id is null`).limit(1);
    assert.ok(catalogue, "seed includes catalogue-only exercises");
    const historyId = `catalogue-${catalogue.id}`;
    const [history] = await db.select().from(schema.exercises).where(eq(schema.exercises.id, historyId)).limit(1);
    assert.equal(history?.catalogueId, catalogue.id);
    const [session] = await db.select().from(schema.athleteSessions).limit(1);
    const [slot] = await db.select().from(schema.strengthSlots).where(sql`id not like 'v2-%'`).limit(1);
    await db.insert(schema.workoutResults).values({ id: "result-catalogue-only", sessionId: session.id, athleteId: session.athleteId, completedDate: session.scheduledDate, rpe: 7, feel: 8, averagePace: "", totalTime: "", notes: "" });
    await db.insert(schema.exercisePerformances).values({ id: "performance-catalogue-only", resultId: "result-catalogue-only", athleteId: session.athleteId, exerciseId: historyId, slotId: slot.id, workingLoadKg: 42, note: "", performedAt: session.scheduledDate });
    assert.equal((await db.select().from(schema.exercisePerformances).where(eq(schema.exercisePerformances.exerciseId, historyId))).length, 1);
  } finally { await miniflare.dispose(); }
});

test("built-in Strength A clone uses new focus-slot and history-slot ids", async () => {
  const { miniflare, db } = await seededDb();
  try {
    const [base] = await db.select().from(schema.strengthTemplates).where(eq(schema.strengthTemplates.id, "strength-template-a"));
    const baseSlots = await db.select().from(schema.strengthFocusSlots).where(eq(schema.strengthFocusSlots.templateId, base.id));
    const cloneId = "strength-template-clone-test";
    await db.insert(schema.strengthTemplates).values({ id: cloneId, teamId: "team-thomas-kt", name: "Strength A Clone", purpose: base.purpose, isBuiltIn: false, baseTemplateId: base.id, active: true, updatedAt: new Date().toISOString() });
    for (const [index, slot] of baseSlots.entries()) {
      const historySlotId = `${cloneId}-history-${index + 1}`;
      const [sourceHistory] = await db.select().from(schema.strengthSlots).where(eq(schema.strengthSlots.id, slot.historySlotId));
      await db.insert(schema.strengthSlots).values({ id: historySlotId, workoutKind: cloneId, sortOrder: index, trainingGoal: sourceHistory.trainingGoal, defaultExerciseId: sourceHistory.defaultExerciseId, workingSets: sourceHistory.workingSets, repLow: sourceHistory.repLow, repHigh: sourceHistory.repHigh });
      await db.insert(schema.strengthFocusSlots).values({ id: `${cloneId}-slot-${index + 1}`, templateId: cloneId, focusId: slot.focusId, exerciseId: slot.exerciseId, historySlotId, prescription: slot.prescription, sortOrder: index, notes: slot.notes });
    }
    const cloneSlots = await db.select().from(schema.strengthFocusSlots).where(eq(schema.strengthFocusSlots.templateId, cloneId));
    assert.equal(base.baseTemplateId, null);
    assert.ok(cloneSlots.every((slot) => !baseSlots.some((baseSlot) => baseSlot.id === slot.id)));
    assert.ok(cloneSlots.every((slot) => !baseSlots.some((baseSlot) => baseSlot.historySlotId === slot.historySlotId)));
  } finally { await miniflare.dispose(); }
});

test("location inventories are distinct and seed idempotence holds", async () => {
  const { miniflare, db } = await seededDb();
  try {
    await ensureSeeded(db);
    const locations = await db.select().from(schema.locationEquipment);
    const building = locations.filter((row) => row.locationId === "location-building-gym").map((row) => row.equipment);
    const everlast = locations.filter((row) => row.locationId === "location-everlast").map((row) => row.equipment);
    assert.equal(new Set(locations.map((row) => `${row.locationId}:${row.equipment}`)).size, locations.length);
    assert.equal(building.includes("Sled"), false);
    assert.equal(everlast.includes("Sled"), true);
    assert.ok(everlast.length > building.length);
  } finally { await miniflare.dispose(); }
});

test("Programme Designer intents materialize and remain a snapshot after template edits", async () => {
  const { miniflare, db } = await seededDb();
  try {
    const [week] = await db.select().from(schema.plannedWeeks).limit(1);
    const weekTypeId = "week-type-custom-test";
    await db.insert(schema.weekTypeTemplates).values({ id: weekTypeId, teamId: "team-thomas-kt", name: "Custom Test Week", rationale: "", hardTarget: 1, strengthTarget: 1, easyTarget: 1, defaultLocationId: null, priorityEmphasis: "balanced", isBuiltIn: false, active: true, baseJson: "{}", updatedAt: new Date().toISOString() });
    await db.insert(schema.weekTypeDayIntents).values({ id: `${weekTypeId}-0`, weekTypeId, day: 0, intent: "Custom Threshold Intent", workoutId: null, strengthTemplateId: null, progressionTrackId: null, locationId: "location-everlast", priorityEmphasis: "balanced" });
    const rows = await reconcileV2RecommendedWeek(db, week, await db.select().from(schema.weekTypeDayIntents).where(eq(schema.weekTypeDayIntents.weekTypeId, weekTypeId)), true);
    assert.equal(rows[0].title, "Custom Threshold Intent");
    const [shared] = await db.select().from(schema.sharedSessions).where(eq(schema.sharedSessions.id, `shared-${week.id}-0`));
    assert.equal(shared.title, "Custom Threshold Intent");
    assert.equal(shared.locationId, "location-everlast");
    await db.update(schema.weekTypeDayIntents).set({ intent: "Edited Later" }).where(eq(schema.weekTypeDayIntents.id, `${weekTypeId}-0`));
    const [snapshot] = await db.select().from(schema.sharedSessions).where(eq(schema.sharedSessions.id, `shared-${week.id}-0`));
    assert.equal(snapshot.title, "Custom Threshold Intent");
  } finally { await miniflare.dispose(); }
});

test("factory reset is foreign-key safe and reseeds built-ins without replacing identities", async () => {
  const { miniflare, db } = await seededDb();
  try {
    await db.insert(schema.trainingLocations).values({ id: "custom-location", teamId: "team-thomas-kt", name: "Temporary", notes: "", active: true });
    await db.insert(schema.locationEquipment).values({ locationId: "custom-location", equipment: "Sled" });
    await db.insert(schema.trainingFocuses).values({ id: "custom-focus", name: "Temporary focus", purpose: "", defaultPrescription: "", primaryMuscles: "", sourcePatterns: "", hyroxLinksJson: "[]", programmingNotes: "", isBuiltIn: false, active: true, baseJson: "{}" });
    const [catalogue] = await db.select().from(schema.catalogueExercises).limit(1);
    const [legacyExercise] = await db.select().from(schema.exercises).where(sql`id not like 'catalogue-%'`).limit(1);
    await db.insert(schema.strengthTemplates).values({ id: "custom-strength-reset", teamId: "team-thomas-kt", name: "Strength C", purpose: "", isBuiltIn: false, baseTemplateId: null, active: true, updatedAt: new Date().toISOString() });
    await db.insert(schema.strengthSlots).values({ id: "custom-history-slot", workoutKind: "custom-strength-reset", sortOrder: 0, trainingGoal: "Temporary focus", defaultExerciseId: legacyExercise.id, workingSets: 3, repLow: 5, repHigh: 7 });
    await db.insert(schema.strengthFocusSlots).values({ id: "custom-focus-slot", templateId: "custom-strength-reset", focusId: "custom-focus", exerciseId: catalogue.id, historySlotId: "custom-history-slot", prescription: "3 × 5–7", sortOrder: 0, notes: "" });
    await db.insert(schema.workoutLibraryItems).values({ id: "custom-strength-workout-reset", ownerAthleteId: "thomas", name: "Strength C", family: "strength", category: "strength", prescription: "Structured", purpose: "", strengthTemplateId: "custom-strength-reset", isBuiltIn: false, deletedAt: null, createdAt: "", updatedAt: "" });
    await db.insert(schema.progressionTracks).values({ id: "custom-track-reset", teamId: "team-thomas-kt", name: "Custom", purpose: "", isBuiltIn: false, active: true, updatedAt: new Date().toISOString() });
    await db.insert(schema.progressionSteps).values({ id: "custom-step-reset", trackId: "custom-track-reset", workoutId: "custom-strength-workout-reset", title: "Step 1", prescription: "", sortOrder: 0 });
    await db.insert(schema.athleteCurrentLocations).values({ athleteId: "thomas", locationId: "custom-location", updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: schema.athleteCurrentLocations.athleteId, set: { locationId: "custom-location" } });
    await db.insert(schema.athleteHyroxPriorities).values({ athleteId: "thomas", rank: 1, station: "Farmer Carry", updatedAt: new Date().toISOString() });
    const [existingSession] = await db.select().from(schema.athleteSessions).limit(1);
    await db.insert(schema.workoutResults).values({ id: "reset-result", sessionId: existingSession.id, athleteId: existingSession.athleteId, completedDate: existingSession.scheduledDate, rpe: 7, feel: 8, averagePace: "", totalTime: "", notes: "" }).onConflictDoNothing();
    await resetTrainingData(db);
    assert.equal((await db.select({ count: sql`count(*)` }).from(schema.athletes))[0].count, 2);
    assert.equal((await db.select().from(schema.trainingLocations).where(eq(schema.trainingLocations.id, "custom-location"))).length, 0);
    assert.equal((await db.select().from(schema.trainingFocuses).where(eq(schema.trainingFocuses.id, "custom-focus"))).length, 0);
    assert.equal((await db.select().from(schema.strengthTemplates).where(eq(schema.strengthTemplates.id, "custom-strength-reset"))).length, 0);
    assert.equal((await db.select().from(schema.workoutLibraryItems).where(eq(schema.workoutLibraryItems.id, "custom-strength-workout-reset"))).length, 0);
    assert.equal((await db.select().from(schema.progressionTracks).where(eq(schema.progressionTracks.id, "custom-track-reset"))).length, 0);
    assert.equal((await db.select().from(schema.workoutResults).where(eq(schema.workoutResults.id, "reset-result"))).length, 0);
    assert.equal((await db.select().from(schema.trainingFocuses)).length, 14);
    assert.equal((await db.select().from(schema.strengthFocusSlots).where(eq(schema.strengthFocusSlots.templateId, "strength-template-a"))).length, 7);
    assert.equal((await db.select().from(schema.strengthFocusSlots).where(eq(schema.strengthFocusSlots.templateId, "strength-template-b"))).length, 7);
  } finally { await miniflare.dispose(); }
});

test("programme-week intents preserve race and recovery-specific recommendations", async () => {
  const { miniflare, db } = await seededDb();
  try {
    for (const [weekId, expectedDay, expectedTitle] of [["week-2026-11-09", 2, "HYROX Dublin"], ["week-2026-11-30", 4, "HYROX London"]]) {
      const [week] = await db.select().from(schema.plannedWeeks).where(eq(schema.plannedWeeks.id, weekId));
      const intents = await db.select().from(schema.programmeWeekDayIntents).where(eq(schema.programmeWeekDayIntents.weekId, weekId));
      const rows = await reconcileV2RecommendedWeek(db, week, intents, true);
      assert.equal(rows.find((row) => row.sortOrder === expectedDay)?.title, expectedTitle);
    }
    const [recoveryWeek] = await db.select().from(schema.plannedWeeks).where(eq(schema.plannedWeeks.id, "week-2026-11-16"));
    const recoveryIntents = await db.select().from(schema.programmeWeekDayIntents).where(eq(schema.programmeWeekDayIntents.weekId, recoveryWeek.id));
    const materialized = await reconcileV2RecommendedWeek(db, recoveryWeek, recoveryIntents, true);
    assert.equal(materialized[0].title, "Dublin recovery");
    assert.notEqual(materialized[0].title, "Tread and Shred");
  } finally { await miniflare.dispose(); }
});

test("programme progression override materializes current LT2 and VO2 steps", async () => {
  const { miniflare, db } = await seededDb();
  try {
    const [week] = await db.select().from(schema.plannedWeeks).where(eq(schema.plannedWeeks.id, "week-2026-09-21"));
    const [intent] = await db.select().from(schema.programmeWeekDayIntents).where(eq(schema.programmeWeekDayIntents.weekId, week.id)).where(eq(schema.programmeWeekDayIntents.day, 3));
    const lt2Rows = await reconcileV2RecommendedWeek(db, week, [{ ...intent, progressionTrackId: "track-lt2-running", workoutId: null }], true);
    assert.equal(lt2Rows[0].title, "3 × 8 min");
    const vo2Rows = await reconcileV2RecommendedWeek(db, week, [{ ...intent, progressionTrackId: "track-vo2-running", workoutId: null }], true);
    assert.equal(vo2Rows[0].title, "8 × 2 min");
  } finally { await miniflare.dispose(); }
});

test("built-in V2 Strength A/B slots are fully resolved and aliases are explicit", async () => {
  const { miniflare, db } = await seededDb();
  try {
    const slots = await db.select().from(schema.strengthFocusSlots);
    for (const templateId of ["strength-template-a", "strength-template-b"]) {
      const rows = slots.filter((slot) => slot.templateId === templateId);
      assert.equal(rows.length, 7);
      for (const row of rows) {
        assert.ok(row.exerciseId && row.historySlotId && row.prescription);
        assert.ok((await db.select().from(schema.catalogueExercises).where(eq(schema.catalogueExercises.id, row.exerciseId))).length);
        const [historySlot] = await db.select().from(schema.strengthSlots).where(eq(schema.strengthSlots.id, row.historySlotId));
        assert.ok(historySlot?.defaultExerciseId);
      }
    }
    assert.equal(LEGACY_CATALOGUE_ALIAS_MAP["db-rdl"], "duo-ex-011");
    assert.equal(LEGACY_CATALOGUE_ALIAS_MAP["db-shoulder-press"], "duo-ex-040");
  } finally { await miniflare.dispose(); }
});

test("Strength A clone service creates independent V2 and history identities", async () => {
  const { miniflare, db } = await seededDb();
  try {
    const result = await cloneStrengthTemplate(db, "strength-template-a", { id: "strength-template-clone-service", teamId: "team-thomas-kt", name: "Strength A Clone Service" });
    assert.equal(result.slotCount, 7);
    const base = await db.select().from(schema.strengthFocusSlots).where(eq(schema.strengthFocusSlots.templateId, "strength-template-a"));
    const clone = await db.select().from(schema.strengthFocusSlots).where(eq(schema.strengthFocusSlots.templateId, result.id));
    assert.equal(clone.length, 7);
    assert.ok(clone.every((row) => !base.some((source) => source.id === row.id || source.historySlotId === row.historySlotId)));
    assert.equal((await db.select().from(schema.strengthTemplates).where(eq(schema.strengthTemplates.id, "strength-template-a"))).length, 1);
  } finally { await miniflare.dispose(); }
});

test("equipment matching canonicalizes wall balls and HYROX sled pull setup", () => {
  assert.equal(exerciseAvailable("Wall Ball", "None", ["Wall Balls"]), true);
  assert.equal(exerciseAvailable("Sled", "None", ["Sled"]), true);
  assert.equal(exerciseAvailable("Sled", "Battle Ropes", ["Sled"]), true);
  assert.equal(exerciseAvailable("Sled", "Battle Ropes", []), false);
  assert.equal(exerciseAvailable("Dumbbell", "Bench (Flat)", ["Dumbbell"]), false);
  assert.equal(exerciseAvailable("Dumbbell", "Bench (Flat)", ["Dumbbell", "Bench (Flat)"]), true);
});

test("real strength completion persists catalogue history and failed replacement is non-destructive", async () => {
  const { miniflare, db } = await seededDb();
  try {
    const [session] = await db.select().from(schema.athleteSessions).where(eq(schema.athleteSessions.athleteId, "thomas")).limit(1);
    const [slot] = await db.select().from(schema.strengthSlots).where(eq(schema.strengthSlots.id, "a-knee"));
    const [catalogue] = await db.select().from(schema.catalogueExercises).where(eq(schema.catalogueExercises.id, "duo-ex-001"));
    const resultId = `result-${session.id}`;
    await db.insert(schema.workoutResults).values({ id: resultId, sessionId: session.id, athleteId: "thomas", completedDate: session.scheduledDate, rpe: 7, feel: 8, averagePace: "", totalTime: "", notes: "" });
    const first = { slotId: slot.id, exerciseId: catalogue.id, sets: [{ weightKg: 80, reps: 7 }, { weightKg: 80, reps: 7 }, { weightKg: 80, reps: 7 }] };
    await completeStrengthEntries(db, { resultId, athleteId: "thomas", completedDate: session.scheduledDate, entries: [first] });
    assert.equal((await db.select().from(schema.exercisePerformances).where(eq(schema.exercisePerformances.resultId, resultId))).length, 1);
    assert.equal((await db.select().from(schema.strengthSets)).filter((row) => row.performanceId.startsWith(`performance-${resultId}`)).length, 3);
    const [state] = await db.select().from(schema.progressionStates).where(eq(schema.progressionStates.exerciseId, "smith-squat")).where(eq(schema.progressionStates.athleteId, "thomas"));
    assert.equal(state?.recommendedLoadKg, 85);
    const before = await db.select().from(schema.exercisePerformances).where(eq(schema.exercisePerformances.resultId, resultId));
    await assert.rejects(() => completeStrengthEntries(db, { resultId, athleteId: "thomas", completedDate: session.scheduledDate, entries: [first, { slotId: "missing", exerciseId: catalogue.id, sets: [{ weightKg: 1, reps: 1 }] }] }));
    assert.deepEqual(await db.select().from(schema.exercisePerformances).where(eq(schema.exercisePerformances.resultId, resultId)), before);
  } finally { await miniflare.dispose(); }
});
