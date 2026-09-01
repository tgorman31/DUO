import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { V2_EXERCISE_CATALOGUE, V2_TRAINING_FOCUSES, V2_HYROX_FOCUS_RELATIONSHIPS } from "../lib/v2-catalogue.ts";

test("curated V2 catalogue remains opinionated and stable", () => {
  assert.equal(V2_EXERCISE_CATALOGUE.length, 92);
  assert.equal(V2_EXERCISE_CATALOGUE.filter((item) => item.tier === "Core").length, 47);
  assert.equal(V2_EXERCISE_CATALOGUE.filter((item) => item.tier === "Useful").length, 43);
  assert.equal(V2_EXERCISE_CATALOGUE.filter((item) => item.tier === "Niche").length, 2);
  assert.equal(V2_TRAINING_FOCUSES.length, 14);
  assert.ok(V2_HYROX_FOCUS_RELATIONSHIPS.length > 100);
  assert.equal(new Set(V2_EXERCISE_CATALOGUE.map((item) => item.id)).size, V2_EXERCISE_CATALOGUE.length);
});

test("V2 migration is additive and modal selects use the canonical popover layer", async () => {
  const migration = await readFile(new URL("../drizzle/0005_v2_programme_designer.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN)\b/i);
  assert.match(migration, /CREATE TABLE `training_focuses`/);
  assert.match(migration, /CREATE TABLE `training_locations`/);
  const select = await readFile(new URL("../components/ui/select.tsx", import.meta.url), "utf8");
  assert.match(select, /relative z-\[130\]/);
});

test("product completion keeps explicit coverage and safe Programme Designer operations additive", async () => {
  const migration = await readFile(new URL("../drizzle/0009_v2_product_completion.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN)\b/i);
  assert.match(migration, /CREATE TABLE `workout_hyrox_coverage`/);
  const route = await readFile(new URL("../app/api/app/route.ts", import.meta.url), "utf8");
  assert.match(route, /action === "updateBlock"/);
  assert.match(route, /action === "createPhase"/);
  assert.match(route, /action === "deletePhase"/);
  assert.match(route, /action === "updateFutureWeeksFromWeekType"/);
  assert.match(route, /waiting for partner completion/);
  const train = await readFile(new URL("../components/training/train-view.tsx", import.meta.url), "utf8");
  assert.match(train, /HYROX areas hit/);
  assert.match(train, /supporting/);
});
