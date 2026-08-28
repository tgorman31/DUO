import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProgression,
  categoryTotals,
} from "../lib/training-logic.ts";
import { scheduleForWeek } from "../lib/training-data.ts";
import {
  D1_MAX_BOUND_PARAMETERS,
  D1_SAFE_INSERT_PARAMETER_BUDGET,
  d1InsertBatches,
} from "../lib/d1-limits.ts";

test("large seed inserts stay within D1's bound-parameter limit", () => {
  for (const [rowCount, valuesPerRow] of [
    [36, 5],
    [14, 8],
    [13, 10],
    [14, 12],
  ]) {
    const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
      Object.fromEntries(
        Array.from({ length: valuesPerRow }, (__, valueIndex) => [
          `value${valueIndex}`,
          `${rowIndex}-${valueIndex}`,
        ]),
      ),
    );
    const batches = d1InsertBatches(rows);

    assert.deepEqual(batches.flat(), rows);
    assert.equal(
      batches.every(
        (batch) =>
          batch.length * valuesPerRow <= D1_SAFE_INSERT_PARAMETER_BUDGET &&
          batch.length * valuesPerRow <= D1_MAX_BOUND_PARAMETERS,
      ),
      true,
    );
  }
});

test("a third hard session exceeds the target without being blocked", () => {
  const rows = [
    ["2026-10-05", "hard"],
    ["2026-10-08", "hard"],
    ["2026-10-10", "hard"],
  ].map(([scheduledDate, category], index) => ({
    athleteId: "thomas",
    scheduledDate,
    category,
    status: index === 0 ? "completed" : "planned",
  }));
  const totals = categoryTotals(rows, "thomas");
  assert.equal(totals.planned.hard, 3);
  assert.equal(totals.completed.hard, 1);
});

test("consecutive hard days produce an advisory warning", () => {
  const totals = categoryTotals(
    [
      { athleteId: "thomas", scheduledDate: "2026-10-08", category: "hard", status: "planned" },
      { athleteId: "thomas", scheduledDate: "2026-10-09", category: "hard", status: "planned" },
    ],
    "thomas",
  );
  assert.equal(totals.consecutiveHard, true);
});

test("moving a completed strength session still counts by category", () => {
  const totals = categoryTotals(
    [
      { athleteId: "kt", scheduledDate: "2026-10-09", category: "strength", status: "completed" },
      { athleteId: "kt", scheduledDate: "2026-10-10", category: "easy", status: "completed" },
    ],
    "kt",
  );
  assert.equal(totals.completed.strength, 1);
  assert.equal(totals.completed.easy, 1);
});

test("top-of-range reps create a persistent next-load recommendation", () => {
  const earned = calculateProgression({
    currentLoadKg: 80,
    pendingRecommendationKg: null,
    workingLoadKg: 80,
    reps: [7, 7, 7],
    repHigh: 7,
    incrementKg: 5,
  });
  assert.equal(earned.recommendedLoadKg, 85);

  const ignored = calculateProgression({
    currentLoadKg: earned.currentLoadKg,
    pendingRecommendationKg: earned.recommendedLoadKg,
    workingLoadKg: 80,
    reps: [6, 6, 6],
    repHigh: 7,
    incrementKg: 5,
  });
  assert.equal(ignored.recommendedLoadKg, 85);
});

test("using the recommended load clears the old recommendation", () => {
  const accepted = calculateProgression({
    currentLoadKg: 80,
    pendingRecommendationKg: 85,
    workingLoadKg: 85,
    reps: [5, 5, 5],
    repHigh: 7,
    incrementKg: 5,
  });
  assert.equal(accepted.acceptedPending, true);
  assert.equal(accepted.currentLoadKg, 85);
  assert.equal(accepted.recommendedLoadKg, null);
});

test("Saturday HYROX replaces the second quality session in its template", () => {
  const schedule = scheduleForWeek({
    id: "custom-week",
    weekType: "saturday-perpetua",
    qualityFocus: "",
  });
  assert.equal(schedule.filter((session) => session.category === "hard").length, 2);
  assert.equal(schedule.some((session) => session.title === "Perpetua HYROX"), true);
});
