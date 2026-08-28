export type CategoryTotals = {
  planned: { hard: number; strength: number; easy: number };
  completed: { hard: number; strength: number; easy: number };
  consecutiveHard: boolean;
};

export function categoryTotals(
  rows: Array<{
    athleteId: string;
    category: string;
    status: string;
    scheduledDate: string;
  }>,
  athleteId: string,
): CategoryTotals {
  const athleteRows = rows.filter(
    (row) => row.athleteId === athleteId && row.status !== "removed",
  );
  const count = (category: string, completedOnly: boolean) =>
    athleteRows.filter(
      (row) =>
        row.category === category &&
        (!completedOnly || row.status === "completed"),
    ).length;
  const hardDates = [
    ...new Set(
      athleteRows
        .filter((row) => row.category === "hard")
        .map((row) => row.scheduledDate),
    ),
  ].sort();
  const consecutiveHard = hardDates.some((date, index) => {
    if (index === 0) return false;
    const previous = new Date(`${hardDates[index - 1]}T00:00:00Z`).getTime();
    const current = new Date(`${date}T00:00:00Z`).getTime();
    return Math.round((current - previous) / 86_400_000) === 1;
  });

  return {
    planned: {
      hard: count("hard", false),
      strength: count("strength", false),
      easy: count("easy", false),
    },
    completed: {
      hard: count("hard", true),
      strength: count("strength", true),
      easy: count("easy", true),
    },
    consecutiveHard,
  };
}

export function calculateProgression(input: {
  currentLoadKg: number | null;
  pendingRecommendationKg: number | null;
  workingLoadKg: number;
  reps: number[];
  repHigh: number;
  incrementKg: number;
}) {
  const acceptedPending =
    input.pendingRecommendationKg !== null &&
    input.workingLoadKg >= input.pendingRecommendationKg;
  let recommendedLoadKg = acceptedPending
    ? null
    : input.pendingRecommendationKg;
  const earnedProgression =
    input.reps.length > 0 && input.reps.every((reps) => reps >= input.repHigh);

  if (earnedProgression && recommendedLoadKg === null) {
    recommendedLoadKg =
      Math.round((input.workingLoadKg + input.incrementKg) * 10) / 10;
  }

  return {
    acceptedPending,
    earnedProgression,
    currentLoadKg: acceptedPending
      ? input.workingLoadKg
      : Math.max(input.currentLoadKg ?? 0, input.workingLoadKg),
    recommendedLoadKg,
  };
}
