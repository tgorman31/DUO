import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { Miniflare } from "miniflare";
import "tsx";
import * as schema from "../db/schema.ts";

const { ensureSeeded, resetTrainingData, LEGACY_SLOT_FOCUS_MAP } = await import("../db/seed.ts");

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
    assert.equal(slots.length, 14);
    assert.equal(focusSlots.length, 14);
    for (const [slotId, focusId] of Object.entries(LEGACY_SLOT_FOCUS_MAP)) {
      const row = focusSlots.find((slot) => slot.id === `v2-${slotId}`);
      assert.equal(row?.focusId, focusId, slotId);
    }
    assert.equal(focusSlots.find((slot) => slot.id === "v2-a-hamstrings")?.focusId, "focus-ham-curl");
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

test("factory reset is foreign-key safe and reseeds built-ins without replacing identities", async () => {
  const { miniflare, db } = await seededDb();
  try {
    await db.insert(schema.trainingLocations).values({ id: "custom-location", teamId: "team-thomas-kt", name: "Temporary", notes: "", active: true });
    await db.insert(schema.locationEquipment).values({ locationId: "custom-location", equipment: "Sled" });
    await db.insert(schema.trainingFocuses).values({ id: "custom-focus", name: "Temporary focus", purpose: "", defaultPrescription: "", primaryMuscles: "", sourcePatterns: "", hyroxLinksJson: "[]", programmingNotes: "", isBuiltIn: false, active: true, baseJson: "{}" });
    await resetTrainingData(db);
    assert.equal((await db.select({ count: sql`count(*)` }).from(schema.athletes))[0].count, 2);
    assert.equal((await db.select().from(schema.trainingLocations).where(eq(schema.trainingLocations.id, "custom-location"))).length, 0);
    assert.equal((await db.select().from(schema.trainingFocuses).where(eq(schema.trainingFocuses.id, "custom-focus"))).length, 0);
    assert.equal((await db.select().from(schema.trainingFocuses)).length, 14);
  } finally { await miniflare.dispose(); }
});
