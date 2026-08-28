export type SessionCategory = "hard" | "strength" | "easy" | "recovery";

export type SessionSeed = {
  day: number;
  title: string;
  category: SessionCategory;
  workoutKind: string;
  details: string;
};

export type WeekSeed = {
  id: string;
  startDate: string;
  title: string;
  weekType: string;
  rationale: string;
  qualityFocus: string;
  hardTarget: number;
  strengthTarget: number;
  easyTarget: number;
};

export const TEAM_ID = "team-thomas-kt";
export const INITIAL_BLOCK_ID = "block-hyrox-autumn-2026";

export const WEEK_TYPE_INFO: Record<
  string,
  {
    label: string;
    rationale: string;
    targets: { hard: number; strength: number; easy: number };
  }
> = {
  normal: {
    label: "Normal Training Week",
    rationale: "A balanced week with two quality sessions, two strength sessions and aerobic support.",
    targets: { hard: 2, strength: 2, easy: 2 },
  },
  "running-priority": {
    label: "Running Priority",
    rationale: "Prioritises LT2 or VO₂ development while strength continues to build.",
    targets: { hard: 2, strength: 2, easy: 2 },
  },
  "saturday-perpetua": {
    label: "Saturday Perpetua HYROX",
    rationale: "Saturday HYROX replaces the second major hard stimulus rather than adding a third.",
    targets: { hard: 2, strength: 2, easy: 2 },
  },
  everlast: {
    label: "Everlast Performance Centre",
    rationale: "Protects rare sled access for technique, race load, station sharing and transitions.",
    targets: { hard: 2, strength: 1, easy: 2 },
  },
  "hyrox-priority": {
    label: "HYROX Priority",
    rationale: "Maintains strength while shifting the second quality session toward compromised running.",
    targets: { hard: 2, strength: 2, easy: 2 },
  },
  deload: {
    label: "Deload",
    rationale: "Reduces accumulated fatigue while keeping the rhythm of the training week.",
    targets: { hard: 1, strength: 2, easy: 2 },
  },
  recovery: {
    label: "Recovery / Reintroduction",
    rationale: "Restores movement gradually after SwissPeaks without forcing early intensity.",
    targets: { hard: 0, strength: 0, easy: 2 },
  },
  reintroduction: {
    label: "Reintroduction Week",
    rationale: "Brings easy running and light Strength A/B back in without chasing load.",
    targets: { hard: 0, strength: 2, easy: 2 },
  },
  race: {
    label: "Race Week",
    rationale: "Adapts around the actual race date and reduces fatigue while preserving race feel.",
    targets: { hard: 1, strength: 0, easy: 2 },
  },
};

export const PHASE_SEEDS = [
  {
    id: "phase-ultra-recovery",
    name: "Ultra Recovery",
    startDate: "2026-09-06",
    endDate: "2026-09-20",
    focus: "Recover from SwissPeaks and gradually reintroduce running and lifting.",
    sortOrder: 1,
  },
  {
    id: "phase-strength-running",
    name: "Strength & Running Rebuild",
    startDate: "2026-09-21",
    endDate: "2026-10-18",
    focus: "Build Strength A/B and restore LT2 and VO₂ running quality.",
    sortOrder: 2,
  },
  {
    id: "phase-hyrox-build",
    name: "HYROX Build",
    startDate: "2026-10-19",
    endDate: "2026-11-01",
    focus: "Maintain strength and increase compromised-running specificity.",
    sortOrder: 3,
  },
  {
    id: "phase-dublin-prep",
    name: "Dublin Preparation",
    startDate: "2026-11-02",
    endDate: "2026-11-11",
    focus: "Reduce fatigue while retaining intensity and race feel.",
    sortOrder: 4,
  },
  {
    id: "phase-final-build",
    name: "Dublin Recovery & Final Build",
    startDate: "2026-11-12",
    endDate: "2026-11-22",
    focus: "Review Dublin, recover, then complete the last meaningful specific session.",
    sortOrder: 5,
  },
  {
    id: "phase-london-taper",
    name: "London Taper",
    startDate: "2026-11-23",
    endDate: "2026-12-04",
    focus: "Arrive fresh for London while preserving sharpness.",
    sortOrder: 6,
  },
];

export const EVENT_SEEDS = [
  {
    id: "event-swisspeaks-2026",
    name: "SwissPeaks Ultra",
    eventDate: "2026-09-05",
    location: "Valais, Switzerland",
    eventType: "Mountain ultra",
    raceFormat: "46 km mountain ultra",
    partner: "",
    priority: "A",
    label: "Recovery marker",
    notes: "Marks the beginning of the recovery period.",
  },
  {
    id: "event-hyrox-dublin-2026",
    name: "HYROX Dublin",
    eventDate: "2026-11-11",
    location: "Dublin, Ireland",
    eventType: "HYROX",
    raceFormat: "Mixed Doubles",
    partner: "Thomas + KT",
    priority: "A",
    label: "Race 1",
    notes: "A real race and a learning point for London.",
  },
  {
    id: "event-hyrox-london-2026",
    name: "HYROX London",
    eventDate: "2026-12-04",
    location: "London, UK",
    eventType: "HYROX",
    raceFormat: "Mixed Doubles",
    partner: "Thomas + KT",
    priority: "A",
    label: "Race 2",
    notes: "Final event in the initial training block.",
  },
];

export const WEEK_SEEDS: WeekSeed[] = [
  {
    id: "week-2026-09-07",
    startDate: "2026-09-07",
    title: "Recovery Week",
    weekType: "recovery",
    rationale: "Very easy movement only after SwissPeaks.",
    qualityFocus: "Recover",
    hardTarget: 0,
    strengthTarget: 0,
    easyTarget: 2,
  },
  {
    id: "week-2026-09-14",
    startDate: "2026-09-14",
    title: "Reintroduction Week",
    weekType: "reintroduction",
    rationale: "Easy running and light introductory Strength A/B.",
    qualityFocus: "Reintroduce",
    hardTarget: 0,
    strengthTarget: 2,
    easyTarget: 2,
  },
  {
    id: "week-2026-09-21",
    startDate: "2026-09-21",
    title: "Running Priority",
    weekType: "running-priority",
    rationale: "Controlled threshold volume returns while strength builds.",
    qualityFocus: "LT2 — 3 × 8 min",
    hardTarget: 2,
    strengthTarget: 2,
    easyTarget: 2,
  },
  {
    id: "week-2026-09-28",
    startDate: "2026-09-28",
    title: "Running Priority",
    weekType: "running-priority",
    rationale: "A controlled VO₂ stimulus develops repeatable faster running.",
    qualityFocus: "VO₂ — 8 × 2 min",
    hardTarget: 2,
    strengthTarget: 2,
    easyTarget: 2,
  },
  {
    id: "week-2026-10-05",
    startDate: "2026-10-05",
    title: "Running Priority",
    weekType: "running-priority",
    rationale: "Threshold intervals extend while weekly structure remains stable.",
    qualityFocus: "LT2 — 3 × 10 min",
    hardTarget: 2,
    strengthTarget: 2,
    easyTarget: 2,
  },
  {
    id: "week-2026-10-12",
    startDate: "2026-10-12",
    title: "Deload",
    weekType: "deload",
    rationale: "Strength volume drops by about 30% and quality stays controlled.",
    qualityFocus: "3 × 5 min controlled threshold",
    hardTarget: 2,
    strengthTarget: 2,
    easyTarget: 2,
  },
  {
    id: "week-2026-10-19",
    startDate: "2026-10-19",
    title: "Running → HYROX",
    weekType: "running-priority",
    rationale: "The final running-priority stimulus leads into specific work.",
    qualityFocus: "VO₂ — 6 × 3 min",
    hardTarget: 2,
    strengthTarget: 2,
    easyTarget: 2,
  },
  {
    id: "week-2026-10-26",
    startDate: "2026-10-26",
    title: "HYROX Priority",
    weekType: "hyrox-priority",
    rationale: "Compromised running replaces the main standalone interval session.",
    qualityFocus: "35-min HYROX threshold",
    hardTarget: 2,
    strengthTarget: 2,
    easyTarget: 2,
  },
  {
    id: "week-2026-11-02",
    startDate: "2026-11-02",
    title: "Dublin Sharpening",
    weekType: "deload",
    rationale: "Volume falls while short race-specific intensity remains.",
    qualityFocus: "Short HYROX sharpener",
    hardTarget: 2,
    strengthTarget: 1,
    easyTarget: 2,
  },
  {
    id: "week-2026-11-09",
    startDate: "2026-11-09",
    title: "Dublin Race Week",
    weekType: "race",
    rationale: "Training adapts around Wednesday's race.",
    qualityFocus: "HYROX Dublin",
    hardTarget: 1,
    strengthTarget: 0,
    easyTarget: 2,
  },
  {
    id: "week-2026-11-16",
    startDate: "2026-11-16",
    title: "Recover → Final Build",
    weekType: "hyrox-priority",
    rationale: "Recover first, then complete one meaningful specific session if ready.",
    qualityFocus: "Final HYROX-specific session",
    hardTarget: 1,
    strengthTarget: 1,
    easyTarget: 2,
  },
  {
    id: "week-2026-11-23",
    startDate: "2026-11-23",
    title: "London Taper",
    weekType: "deload",
    rationale: "Reduce volume while maintaining intensity and race feel.",
    qualityFocus: "Short controlled sharpener",
    hardTarget: 1,
    strengthTarget: 1,
    easyTarget: 2,
  },
  {
    id: "week-2026-11-30",
    startDate: "2026-11-30",
    title: "London Race Week",
    weekType: "race",
    rationale: "Training adapts around Friday's race.",
    qualityFocus: "HYROX London",
    hardTarget: 1,
    strengthTarget: 0,
    easyTarget: 2,
  },
];

const session = (
  day: number,
  title: string,
  category: SessionCategory,
  workoutKind: string,
  details: string,
): SessionSeed => ({ day, title, category, workoutKind, details });

const rest = (day: number, title = "Rest / recovery") =>
  session(day, title, "recovery", "rest", "No training target attached. Recover and adapt as needed.");

export function scheduleForWeek(week: WeekSeed | { id: string; weekType: string; qualityFocus: string }) {
  if (week.id === "week-2026-11-09") {
    return [
      session(0, "Easy + strides", "easy", "easy-strides", "35–45 min easy + 4 short strides"),
      rest(1, "Rest / optional shakeout"),
      session(2, "HYROX Dublin", "hard", "race", "HYROX Mixed Doubles — Race 1"),
      rest(3),
      session(4, "Very easy recovery", "easy", "easy", "Keep this genuinely easy and short"),
      session(5, "Easy aerobic if recovered", "easy", "easy", "Optional, based on recovery"),
      rest(6),
    ];
  }

  if (week.id === "week-2026-11-30") {
    return [
      session(0, "Easy / moderate", "easy", "easy", "No normal hard Tread and Shred"),
      session(1, "Easy + strides", "easy", "easy-strides", "30–40 min easy + 4 strides"),
      session(2, "Short activation", "recovery", "activation", "Optional 20-minute race activation"),
      rest(3, "Rest / short shakeout"),
      session(4, "HYROX London", "hard", "race", "HYROX Mixed Doubles — Race 2"),
      rest(5),
      rest(6),
    ];
  }

  if (week.id === "week-2026-11-16") {
    return [
      rest(0, "Dublin recovery"),
      session(1, "Easy recovery", "easy", "easy", "30–40 min very easy if ready"),
      session(2, "Light Strength A", "strength", "strength-a", "Reduce lower-body load if soreness remains"),
      rest(3),
      session(4, "Easy + strides", "easy", "easy-strides", "Easy aerobic with relaxed strides"),
      session(5, "Final HYROX-specific session", "hard", "hyrox", "One meaningful session only if both athletes are recovered"),
      rest(6),
    ];
  }

  switch (week.weekType) {
    case "recovery":
      return [
        rest(0, "Full recovery"),
        session(1, "Recovery walk", "easy", "easy", "Very easy movement only"),
        rest(2),
        session(3, "Easy mobility + walk", "easy", "easy", "Stop if fatigue rises"),
        rest(4),
        session(5, "Easy movement", "easy", "easy", "Optional and deliberately gentle"),
        rest(6),
      ];
    case "reintroduction":
      return [
        rest(0),
        session(1, "Easy run", "easy", "easy", "30–40 min conversational"),
        session(2, "Light Strength A", "strength", "strength-a", "Introductory loads; leave plenty in reserve"),
        rest(3),
        session(4, "Light Strength B", "strength", "strength-b", "Introductory loads; no grinding reps"),
        session(5, "Longer easy run", "easy", "long-easy", "40–55 min relaxed"),
        rest(6),
      ];
    case "saturday-perpetua":
      return [
        session(0, "Tread and Shred", "hard", "tread-shred", "Fast treadmill work + mixed conditioning"),
        session(1, "Longer easy run", "easy", "long-easy", "Conversational aerobic work"),
        session(2, "Strength A", "strength", "strength-a", "Squat / push emphasis"),
        session(3, "Easy + strides", "easy", "easy-strides", "Easy or steady + 4–6 strides"),
        session(4, "Strength B — reduced legs", "strength", "strength-b", "Protect Saturday quality"),
        session(5, "Perpetua HYROX", "hard", "hyrox", "Replaces the second major hard stimulus"),
        rest(6),
      ];
    case "everlast":
      return [
        session(0, "Tread and Shred", "hard", "tread-shred", "Fast treadmill work + mixed conditioning"),
        session(1, "Easy / longer aerobic", "easy", "long-easy", "Conversational aerobic work"),
        session(2, "Strength A", "strength", "strength-a", "Squat / push emphasis"),
        session(3, "Easy + strides", "easy", "easy-strides", "Controlled and low fatigue"),
        rest(4, "Rest / light upper body"),
        session(5, "Everlast sled session", "hard", "everlast", "Race load, technique, station sharing and transitions"),
        rest(6),
      ];
    case "hyrox-priority":
      return [
        session(0, "Tread and Shred", "hard", "tread-shred", "Fast treadmill work + mixed conditioning"),
        session(1, "Easy run", "easy", "easy", "Conversational aerobic work"),
        session(2, "Strength A", "strength", "strength-a", "Squat / push emphasis"),
        session(3, "Easy / steady", "easy", "easy", "Keep clear of threshold"),
        session(4, "Strength B", "strength", "strength-b", "Optionally reduce lower-body volume"),
        session(5, week.qualityFocus || "HYROX-specific workout", "hard", "hyrox", "Compromised running and purposeful transitions"),
        rest(6),
      ];
    case "deload":
      return [
        session(0, "Easy aerobic", "easy", "easy", "Keep the session conversational and low fatigue"),
        session(1, "Easy run", "easy", "easy", "Conversational aerobic work"),
        session(2, "Strength A — deload", "strength", "strength-a", "About 30% less volume"),
        session(3, week.qualityFocus || "Controlled quality", "hard", "run-quality", "Short and controlled"),
        session(4, "Strength B — deload", "strength", "strength-b", "About 30% less volume"),
        session(5, "Easy aerobic", "easy", "long-easy", "Relaxed, no pace target"),
        rest(6),
      ];
    case "race":
      return [rest(0), session(1, "Easy + strides", "easy", "easy-strides", "Short and relaxed"), rest(2), rest(3), rest(4), rest(5), rest(6)];
    case "normal":
    case "running-priority":
    default:
      return [
        session(0, "Tread and Shred", "hard", "tread-shred", "Fast treadmill work + mixed conditioning"),
        session(1, "Easy run + strides", "easy", "easy-strides", "35–60 min easy + 4–6 strides"),
        session(2, "Strength A", "strength", "strength-a", "Squat / push emphasis"),
        session(3, week.qualityFocus || "Quality run", "hard", "run-quality", "Controlled, repeatable main running workout"),
        session(4, "Strength B", "strength", "strength-b", "Pull / unilateral / HYROX support"),
        session(5, "Long easy run", "easy", "long-easy", "Configurable conversational duration"),
        rest(6),
      ];
  }
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export const EXERCISE_SEEDS = [
  ["smith-squat", "Smith Squat", "Primary knee-dominant strength", 5, false],
  ["leg-press", "Leg Press", "Heavy lower-body strength", 5, false],
  ["hack-squat", "Hack Squat", "Primary knee-dominant strength", 5, false],
  ["goblet-squat", "Heavy Goblet Squat", "Primary knee-dominant strength", 2, false],
  ["db-press", "DB Flat / Incline Press", "Horizontal pushing strength", 2, false],
  ["machine-chest-press", "Machine Chest Press", "Horizontal pushing strength", 2.5, false],
  ["lat-pulldown", "Lat Pulldown", "Vertical pulling / Ski support", 2.5, false],
  ["pull-up", "Pull-up", "Vertical pulling / Ski support", 2.5, false],
  ["single-leg-press", "Single-leg Press", "Unilateral lower-body strength", 2.5, false],
  ["bulgarian-split-squat", "Bulgarian Split Squat", "Unilateral lower-body strength", 2, false],
  ["step-up", "Step-up", "Unilateral lower-body strength", 2, false],
  ["reverse-lunge", "Reverse Lunge", "Unilateral lower-body strength", 2, false],
  ["walking-lunge", "Walking Lunge", "Unilateral lower-body strength", 2, false],
  ["leg-curl", "Leg Curl", "Hamstrings", 2.5, true],
  ["rdl", "RDL", "Hamstrings", 5, false],
  ["smith-rdl", "Smith RDL", "Hamstrings", 5, false],
  ["db-rdl", "DB RDL", "Hamstrings", 2, false],
  ["single-leg-rdl", "Single-leg RDL", "Hamstrings", 2, false],
  ["calf-raise", "Calf Raise", "Calf strength", 2.5, true],
  ["standing-calf-raise", "Standing Calf Raise", "Calf strength", 2.5, true],
  ["seated-calf-raise", "Seated Calf Raise", "Calf strength", 2.5, true],
  ["farmer-carry", "Farmer Carry", "Grip / carry / trunk", 2, true],
  ["suitcase-hold", "Suitcase Hold", "Grip / carry / trunk", 2, true],
  ["suitcase-carry", "Suitcase Carry", "Grip / carry / trunk", 2, true],
  ["dead-hang", "Dead Hang", "Grip / carry / trunk", 0, true],
  ["machine-row", "DB / Machine Row", "Horizontal pull", 2.5, false],
  ["cable-row", "Cable Row", "Horizontal pull", 2.5, false],
  ["chest-supported-row", "Chest-supported Row", "Horizontal pull", 2, false],
  ["db-row", "Single-arm DB Row", "Horizontal pull", 2, false],
  ["db-shoulder-press", "DB Shoulder Press", "Shoulder press", 2, false],
  ["machine-shoulder-press", "Machine Shoulder Press", "Shoulder press", 2.5, false],
  ["leg-extension", "Leg Extension", "Quad capacity", 2.5, true],
  ["db-pullover", "DB Pullover", "SkiErg support", 2, true],
  ["straight-arm-pulldown", "Cable Straight-arm Pulldown", "SkiErg support", 2.5, true],
  ["weighted-plank", "Weighted Plank", "Core / grip", 2.5, true],
  ["side-plank", "Side Plank", "Core / grip", 0, true],
] as const;

export const HYROX_CARRYOVER: Record<string, string[]> = {
  "smith-squat": ["Sled Push", "Wall Balls"],
  "hack-squat": ["Sled Push", "Wall Balls"],
  "goblet-squat": ["Sled Push", "Wall Balls"],
  "db-press": ["Burpee Broad Jumps", "Wall Balls"],
  "machine-chest-press": ["Burpee Broad Jumps", "Wall Balls"],
  "lat-pulldown": ["SkiErg", "Sled Pull"],
  "pull-up": ["SkiErg", "Sled Pull"],
  "single-leg-press": ["Sandbag Lunges", "Running", "Sled Push"],
  "bulgarian-split-squat": ["Sandbag Lunges", "Running", "Sled Push"],
  "step-up": ["Sandbag Lunges", "Running", "Sled Push"],
  "reverse-lunge": ["Sandbag Lunges", "Running", "Sled Push"],
  "walking-lunge": ["Sandbag Lunges", "Running", "Sled Push"],
  "leg-curl": ["Running", "Row", "Sled Pull"],
  rdl: ["Running", "Row", "Sled Pull"],
  "smith-rdl": ["Running", "Row", "Sled Pull"],
  "db-rdl": ["Running", "Row", "Sled Pull"],
  "single-leg-rdl": ["Running", "Row", "Sled Pull"],
  "calf-raise": ["Running"],
  "standing-calf-raise": ["Running"],
  "seated-calf-raise": ["Running"],
  "farmer-carry": ["Farmer Carry", "Sled Pull"],
  "suitcase-hold": ["Farmer Carry", "Sled Pull"],
  "suitcase-carry": ["Farmer Carry", "Sled Pull"],
  "dead-hang": ["Farmer Carry", "Sled Pull"],
  "leg-press": ["Sled Push", "Wall Balls", "Running"],
  "machine-row": ["Sled Pull", "Row"],
  "cable-row": ["Sled Pull", "Row"],
  "chest-supported-row": ["Sled Pull", "Row"],
  "db-row": ["Sled Pull", "Row"],
  "db-shoulder-press": ["Wall Balls", "Farmer Carry"],
  "machine-shoulder-press": ["Wall Balls", "Farmer Carry"],
  "leg-extension": ["Sled Push", "Wall Balls", "Running"],
  "db-pullover": ["SkiErg", "Sled Pull"],
  "straight-arm-pulldown": ["SkiErg", "Sled Pull"],
  "weighted-plank": ["Farmer Carry", "Sled Pull", "Row"],
  "side-plank": ["Farmer Carry", "Sled Pull", "Row"],
};

export const STRENGTH_SLOT_SEEDS = [
  ["a-knee", "strength-a", 1, "Primary knee-dominant strength", "smith-squat", 3, 5, 7],
  ["a-push", "strength-a", 2, "Horizontal pushing strength", "db-press", 3, 5, 8],
  ["a-pull", "strength-a", 3, "Vertical pulling / Ski support", "lat-pulldown", 3, 6, 8],
  ["a-unilateral", "strength-a", 4, "Unilateral lower body", "single-leg-press", 2, 6, 10],
  ["a-hamstrings", "strength-a", 5, "Hamstrings", "leg-curl", 2, 8, 12],
  ["a-calves", "strength-a", 6, "Calves", "calf-raise", 3, 8, 15],
  ["a-grip", "strength-a", 7, "Grip / carry / trunk", "farmer-carry", 3, 8, 15],
  ["b-lower", "strength-b", 1, "Heavy lower-body strength", "leg-press", 3, 6, 10],
  ["b-row", "strength-b", 2, "Horizontal pull", "machine-row", 3, 6, 10],
  ["b-shoulder", "strength-b", 3, "Shoulder press", "db-shoulder-press", 3, 6, 10],
  ["b-unilateral", "strength-b", 4, "Unilateral lower body", "step-up", 2, 8, 10],
  ["b-quads", "strength-b", 5, "Quad accessory", "leg-extension", 2, 10, 15],
  ["b-ski", "strength-b", 6, "SkiErg support", "db-pullover", 2, 12, 15],
  ["b-core", "strength-b", 7, "Core / grip", "weighted-plank", 2, 8, 15],
] as const;

export const SLOT_ALTERNATIVES: Record<string, string[]> = {
  "a-knee": ["smith-squat", "leg-press", "hack-squat", "goblet-squat"],
  "a-push": ["db-press", "machine-chest-press"],
  "a-pull": ["lat-pulldown", "pull-up"],
  "a-unilateral": ["single-leg-press", "bulgarian-split-squat", "step-up", "reverse-lunge"],
  "a-hamstrings": ["leg-curl", "rdl", "smith-rdl", "db-rdl", "single-leg-rdl"],
  "a-calves": ["calf-raise", "standing-calf-raise", "seated-calf-raise"],
  "a-grip": ["farmer-carry", "suitcase-hold", "suitcase-carry", "dead-hang"],
  "b-lower": ["leg-press", "smith-squat"],
  "b-row": ["machine-row", "cable-row", "chest-supported-row", "db-row"],
  "b-shoulder": ["db-shoulder-press", "machine-shoulder-press"],
  "b-unilateral": ["step-up", "reverse-lunge", "bulgarian-split-squat", "single-leg-press", "walking-lunge"],
  "b-quads": ["leg-extension"],
  "b-ski": ["db-pullover", "straight-arm-pulldown"],
  "b-core": ["weighted-plank", "side-plank", "suitcase-hold", "dead-hang"],
};

export type WorkoutLibrarySeed = {
  id: string;
  name: string;
  family: string;
  category: SessionCategory;
  prescription: string;
  purpose: string;
  estimatedDuration: string;
  warmUp: string;
  mainSet: string;
  recovery: string;
  intensityGuidance: string;
  coolDown: string;
  equipment: string;
  notes: string;
  resultType: string;
  customResultLabel: string;
};

export const WORKOUT_LIBRARY_SEEDS: WorkoutLibrarySeed[] = [
  {
    id: "lib-easy-strides",
    name: "Easy + Strides",
    family: "running",
    category: "easy",
    prescription: "35–60 min easy, then 4–6 × 15–20 sec relaxed fast strides.",
    purpose: "Support aerobic recovery while maintaining running mechanics and top-end movement.",
    estimatedDuration: "40–65 min",
    warmUp: "Begin very easily and allow 8–10 minutes to settle into conversational running.",
    mainSet: "35–60 min easy conversational running, then 4–6 × 15–20 sec relaxed fast strides.",
    recovery: "Use generous walking or easy-jog recovery between strides until breathing is settled.",
    intensityGuidance: "Easy running should remain conversational. Strides are fast but controlled, never maximal sprinting.",
    coolDown: "Walk or jog easily for 5 minutes after the final stride.",
    equipment: "Running shoes; watch optional.",
    notes: "Keep the strides smooth and relaxed. Stop if mechanics deteriorate.",
    resultType: "average_pace",
    customResultLabel: "",
  },
  {
    id: "lib-lt2-3x8",
    name: "LT2 — 3 × 8 min",
    family: "running",
    category: "hard",
    prescription: "3 × 8 min controlled threshold with 2–3 min easy jog recoveries.",
    purpose: "Build sustainable high-aerobic running capacity relevant to HYROX running.",
    estimatedDuration: "50–60 min",
    warmUp: "10–15 min easy running, then optionally 3–4 relaxed strides.",
    mainSet: "3 × 8 min controlled threshold.",
    recovery: "2–3 min easy jog between repetitions.",
    intensityGuidance: "Approximately LT2 / threshold, RPE 7–8 of 10. Keep all three repetitions similar in output.",
    coolDown: "10 min easy running.",
    equipment: "Running shoes; watch helpful for interval timing.",
    notes: "Finish feeling that one more controlled repetition would have been possible.",
    resultType: "average_pace",
    customResultLabel: "",
  },
  {
    id: "lib-lt2-3x10",
    name: "LT2 — 3 × 10 min",
    family: "running",
    category: "hard",
    prescription: "3 × 10 min controlled threshold with 2–3 min easy jog recoveries.",
    purpose: "Build sustainable high-aerobic / threshold running capacity relevant to HYROX running.",
    estimatedDuration: "55–65 min",
    warmUp: "10–15 min easy running. Optionally add 3–4 relaxed strides.",
    mainSet: "3 × 10 min controlled threshold.",
    recovery: "2–3 min easy jog between repetitions.",
    intensityGuidance: "Approximately LT2 / threshold, RPE 7–8 of 10. All three repetitions should be completed at similar output.",
    coolDown: "10 min easy running.",
    equipment: "Running shoes; watch helpful for interval timing.",
    notes: "Avoid turning the final repetition into a race. Sustainable output is the goal.",
    resultType: "average_pace",
    customResultLabel: "",
  },
  {
    id: "lib-lt2-2x20",
    name: "LT2 — 2 × 20 min",
    family: "running",
    category: "hard",
    prescription: "2 × 20 min controlled threshold with 3–4 min easy jog recovery.",
    purpose: "Extend sustainable threshold duration and reinforce disciplined pacing.",
    estimatedDuration: "65–75 min",
    warmUp: "12–15 min easy running, then 3–4 relaxed strides.",
    mainSet: "2 × 20 min at controlled LT2 / threshold effort.",
    recovery: "3–4 min easy jog between repetitions.",
    intensityGuidance: "RPE 7–8 of 10. Start conservatively enough that the second block remains technically strong.",
    coolDown: "10 min easy running.",
    equipment: "Running shoes; watch helpful for interval timing.",
    notes: "Prioritise an even effort over chasing a single pace number.",
    resultType: "average_pace",
    customResultLabel: "",
  },
  {
    id: "lib-vo2-8x2",
    name: "VO₂ — 8 × 2 min",
    family: "running",
    category: "hard",
    prescription: "8 × 2 min fast with 90 sec–2 min easy jog recoveries.",
    purpose: "Develop faster aerobic running and repeatable speed without excessive fatigue.",
    estimatedDuration: "45–55 min",
    warmUp: "10–15 min easy running, dynamic drills if useful, then 3–4 short strides.",
    mainSet: "8 × 2 min fast.",
    recovery: "90 sec–2 min easy jog between repetitions.",
    intensityGuidance: "Faster than threshold, RPE 8–9 of 10. Keep the first repetitions controlled so the final repetitions do not deteriorate.",
    coolDown: "10 min easy running.",
    equipment: "Running shoes; watch helpful for interval timing.",
    notes: "Repeatable quality matters more than the fastest single repetition.",
    resultType: "average_pace",
    customResultLabel: "",
  },
  {
    id: "lib-vo2-6x3",
    name: "VO₂ — 6 × 3 min",
    family: "running",
    category: "hard",
    prescription: "6 × 3 min fast with 2 min easy jog recoveries.",
    purpose: "Develop faster aerobic running and VO₂ capacity while keeping each repetition controlled and repeatable.",
    estimatedDuration: "50–60 min",
    warmUp: "10–15 min easy running, then optionally dynamic running drills and 3–4 short strides.",
    mainSet: "6 × 3 min fast.",
    recovery: "2 min easy jog between repetitions.",
    intensityGuidance: "Faster than threshold, controlled and repeatable, approximately RPE 8–9 of 10. Do not run the first repetition so hard that later repetitions deteriorate.",
    coolDown: "10 min easy running.",
    equipment: "Running shoes; watch helpful for interval timing.",
    notes: "Aim for consistent pace and mechanics from first repetition to last.",
    resultType: "average_pace",
    customResultLabel: "",
  },
  {
    id: "lib-long-easy",
    name: "Long Easy Run",
    family: "running",
    category: "easy",
    prescription: "A configurable conversational run with no pace target.",
    purpose: "Develop aerobic endurance and durable time on feet with low recovery cost.",
    estimatedDuration: "50–90 min",
    warmUp: "Begin with 8–10 min very easy running.",
    mainSet: "Continue at a relaxed conversational effort for the planned duration.",
    recovery: "Not applicable; brief walking breaks are acceptable if they keep the session easy.",
    intensityGuidance: "Easy aerobic, approximately RPE 3–4 of 10. Keep clear of threshold.",
    coolDown: "Finish with 5 min very easy running or walking.",
    equipment: "Running shoes; hydration as conditions require.",
    notes: "Duration and easy effort matter more than pace.",
    resultType: "distance",
    customResultLabel: "",
  },
  {
    id: "lib-hyrox-threshold",
    name: "HYROX Threshold AMRAP",
    family: "hyrox",
    category: "hard",
    prescription: "35 min AMRAP: 800 m run + 20 m burpee broad jump + 300–400 m row.",
    purpose: "Sustain threshold-level output while moving efficiently between running and HYROX stations.",
    estimatedDuration: "50–60 min including warm-up and cool-down",
    warmUp: "10 min easy aerobic work, mobility for the stations, then 2–3 short run pickups.",
    mainSet: "35 min AMRAP: 800 m Run, 20 m Burpee Broad Jump, 300–400 m Row. Repeat until time expires.",
    recovery: "No planned standing recovery. Use the easier portions of each movement to regain control.",
    intensityGuidance: "Approximately Zone 4 / threshold, RPE 8 of 10. Sustainable high output, not winning the first round.",
    coolDown: "8–10 min very easy movement, then relaxed mobility as needed.",
    equipment: "Running space or treadmill, rower, marked burpee broad-jump lane.",
    notes: "Move quickly into stations, minimise standing time, keep station technique efficient and regain planned run pace smoothly.",
    resultType: "rounds",
    customResultLabel: "",
  },
  {
    id: "lib-compromised",
    name: "Compromised Running",
    family: "hyrox",
    category: "hard",
    prescription: "4–5 rounds: 800 m run + 500 m SkiErg + 20 walking lunges per leg.",
    purpose: "Train the ability to regain running rhythm after muscular station work.",
    estimatedDuration: "45–60 min",
    warmUp: "10 min easy aerobic work, station movement rehearsal and 2–3 short run pickups.",
    mainSet: "4–5 rounds: 800 m Run, 500 m SkiErg, 20 Walking Lunges per leg.",
    recovery: "Keep transitions purposeful. Add up to 90 sec between rounds only if required to preserve quality.",
    intensityGuidance: "Hard but controlled, approximately RPE 8 of 10. Re-establish efficient run rhythm after every station block.",
    coolDown: "8–10 min easy movement.",
    equipment: "Running space or treadmill, SkiErg, lunge space; sandbag optional if prescribed.",
    notes: "Do not sprint the first run. Judge success by how quickly good mechanics return after stations.",
    resultType: "total_time",
    customResultLabel: "",
  },
  {
    id: "lib-sharpener",
    name: "HYROX Sharpener",
    family: "hyrox",
    category: "hard",
    prescription: "20–25 min: 800 m run + 250–300 m SkiErg + 10–15 burpee broad jumps.",
    purpose: "Retain short race-specific intensity without creating large fatigue during sharpening or taper weeks.",
    estimatedDuration: "35–45 min",
    warmUp: "10 min easy aerobic work plus brief station rehearsal.",
    mainSet: "For 20–25 min, repeat 800 m Run, 250–300 m SkiErg and 10–15 Burpee Broad Jumps as appropriate.",
    recovery: "Keep transitions smooth; take extra recovery if needed to keep the session sharp rather than exhaustive.",
    intensityGuidance: "Race-specific and controlled, approximately RPE 7–8 of 10. Finish with energy in reserve.",
    coolDown: "8–10 min easy movement.",
    equipment: "Running space or treadmill, SkiErg, burpee broad-jump lane.",
    notes: "Use in taper / sharpening weeks. Reduce rounds before compromising recovery.",
    resultType: "rounds",
    customResultLabel: "",
  },
  {
    id: "lib-everlast",
    name: "Sled / Everlast Session",
    family: "hyrox",
    category: "hard",
    prescription: "Race-load sled push/pull, compromised running, transitions and doubles strategy.",
    purpose: "Use rare sled access to rehearse race-load technique, sharing and efficient transitions.",
    estimatedDuration: "50–70 min",
    warmUp: "10 min easy aerobic work, hips/ankles/shoulders mobility and several progressive unloaded sled efforts.",
    mainSet: "Build a controlled circuit around race-load sled push and pull, short runs and agreed doubles transitions. Record the exact stations in notes.",
    recovery: "Use 90 sec–3 min between quality blocks as needed to preserve safe, repeatable sled technique.",
    intensityGuidance: "Hard Conditioning, usually RPE 8 of 10. Never sacrifice posture or footing to force load.",
    coolDown: "8–10 min easy movement and relaxed lower-body mobility.",
    equipment: "Race-compatible sled, plates, lane, rope and running space.",
    notes: "Agree station split strategy before each block and capture any useful load or transition learning.",
    resultType: "completion",
    customResultLabel: "",
  },
  {
    id: "lib-simulation",
    name: "Race Simulation",
    family: "hyrox",
    category: "hard",
    prescription: "A configurable partial or full HYROX simulation completed at an agreed objective.",
    purpose: "Rehearse pacing, transitions and doubles strategy selectively without racing every training session.",
    estimatedDuration: "60–100 min",
    warmUp: "12–15 min easy aerobic work, movement preparation and station-specific rehearsal.",
    mainSet: "Complete the planned partial or full HYROX sequence with stations, loads and split strategy agreed before starting.",
    recovery: "Follow the planned race flow. If this is a partial technical simulation, use purposeful recovery between blocks.",
    intensityGuidance: "Use the planned simulation objective—often RPE 7–8 rather than all-out race effort.",
    coolDown: "10 min easy movement, hydration and brief shared review.",
    equipment: "HYROX station equipment, running route or treadmills and transition space.",
    notes: "Record deviations from race standards and capture transition or station-split learning.",
    resultType: "total_time",
    customResultLabel: "",
  },
];

export function workoutTemplateIdForSession(title: string, workoutKind: string) {
  const value = title.toLowerCase();
  if (workoutKind === "easy-strides" || (value.includes("easy") && value.includes("stride"))) return "lib-easy-strides";
  if (workoutKind === "long-easy" || value.includes("long easy") || value.includes("longer easy")) return "lib-long-easy";
  if (value.includes("3 × 8") || value.includes("3 x 8")) return "lib-lt2-3x8";
  if (value.includes("3 × 10") || value.includes("3 x 10")) return "lib-lt2-3x10";
  if (value.includes("2 × 20") || value.includes("2 x 20")) return "lib-lt2-2x20";
  if (value.includes("8 × 2") || value.includes("8 x 2")) return "lib-vo2-8x2";
  if (value.includes("6 × 3") || value.includes("6 x 3")) return "lib-vo2-6x3";
  if (value.includes("threshold") && value.includes("hyrox")) return "lib-hyrox-threshold";
  if (value.includes("compromised")) return "lib-compromised";
  if (value.includes("sharpener")) return "lib-sharpener";
  if (workoutKind === "everlast" || value.includes("everlast") || value.includes("sled")) return "lib-everlast";
  if (value.includes("simulation")) return "lib-simulation";
  return null;
}
