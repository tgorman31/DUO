export type Category = "hard" | "strength" | "easy" | "recovery";
export type MainView =
  | "home"
  | "week"
  | "train"
  | "progress"
  | "feed"
  | "events"
  | "blocks"
  | "library"
  | "coach"
  | "settings"
  | "more";

export type AppRoute = {
  view: MainView;
  origin?: MainView;
  sessionId?: string;
  mode?: "overview" | "log";
  weekAction?: "add" | "edit";
  workoutId?: string;
  eventId?: string;
  exerciseId?: string;
};

export type LoadConvention =
  | "total_load"
  | "per_hand"
  | "machine_stack"
  | "bodyweight_plus"
  | "single_load"
  | "time"
  | "distance";

export type AthleteSummary = {
  id: string;
  athleteKey?: string;
  displayName: string;
  claimed?: boolean;
  units?: string;
  loadIncrementKg?: number;
  preferredDays?: string[];
  titleBarColor?: string;
};

export type PlannedWeek = {
  id: string;
  blockId: string;
  startDate: string;
  title: string;
  weekType: string;
  rationale: string;
  qualityFocus: string;
  hardTarget: number;
  strengthTarget: number;
  easyTarget: number;
  confirmedAt: string | null;
  status: string;
  planningState: "recommended" | "set" | "in_progress" | "complete";
};

export type Session = {
  id: string;
  weekId: string;
  sharedSessionId: string | null;
  athleteId: string;
  scheduledDate: string;
  title: string;
  category: Category;
  workoutKind: string;
  details: string;
  workoutTemplateId: string | null;
  locationId: string | null;
  assignment: string;
  status: string;
  completedAt: string | null;
  sortOrder: number;
  resultId: string | null;
  rpe: number | null;
  feel: number | null;
  averagePace: string | null;
  totalTime: string | null;
  distance: number | null;
  rounds: number | null;
  reps: number | null;
  calories: number | null;
  customValue: number | null;
  notes: string | null;
  workout: LibraryItem | null;
};

export type OriginalSession = Omit<Session, "athleteId" | "status" | "completedAt" | "resultId" | "rpe" | "feel" | "averagePace" | "totalTime" | "distance" | "rounds" | "reps" | "calories" | "customValue" | "notes" | "sharedSessionId" | "workout">;

export type TargetTotals = {
  planned: { hard: number; strength: number; easy: number };
  completed: { hard: number; strength: number; easy: number };
  consecutiveHard: boolean;
};

export type FeedItem = {
  id: string;
  athleteId: string;
  athleteName: string;
  activityType: string;
  message: string;
  entityId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  reactions: Array<{ athleteId: string; emoji: string }>;
};

export type TrainingEvent = {
  id: string;
  blockId: string;
  name: string;
  eventDate: string;
  eventTime?: string | null;
  location: string;
  eventType: string;
  raceFormat: string;
  partner: string;
  priority: string;
  label: string;
  notes: string;
  status: string;
  daysAway: number;
};

export type ProgressHistory = {
  id: string;
  resultId: string;
  athleteId: string;
  exerciseId: string;
  exerciseName: string;
  slotId: string;
  workingLoadKg: number;
  note: string;
  performedAt: string;
  sets: Array<{ setNumber: number; weightKg: number; reps: number }>;
};

export type ProgressState = {
  athleteId: string;
  exerciseId: string;
  exerciseName: string;
  currentLoadKg: number;
  recommendedLoadKg: number | null;
  lastPerformanceId: string | null;
  updatedAt: string;
  history: ProgressHistory[];
  preferredName: string;
  loadConvention: LoadConvention;
  loadIncrementKg: number;
  approvedAlternativeIds: string[];
  defaultAlternativeId: string | null;
  notes: string;
  alternatives: Array<{ id: string; name: string }>;
};

export type ExerciseOption = {
  slotId: string;
  exerciseId: string;
  name: string;
  baseName: string;
  trainingGoal: string;
  defaultIncrementKg: number;
  loadConvention: LoadConvention;
  isAccessory: boolean;
  hyroxCarryover: string[];
};

export type StrengthSlot = {
  id: string;
  workoutKind: string;
  sortOrder: number;
  trainingGoal: string;
  defaultExerciseId: string;
  workingSets: number;
  repLow: number;
  repHigh: number;
  selectedExerciseId: string;
  options: ExerciseOption[];
};

export type StrengthDefinition = {
  workoutKind: string;
  label: string;
  slots: StrengthSlot[];
};

export type LibraryItem = {
  id: string;
  ownerAthleteId: string | null;
  name: string;
  family: string;
  category: Category;
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
  isBuiltIn: boolean;
  favourite: boolean;
  isRecent: boolean;
  canEdit: boolean;
  strengthTemplateId: string | null;
  priorityEmphasis: string;
};

export type PlanHistoryItem = {
  id: string;
  weekId: string;
  athleteId: string;
  athleteName: string;
  eventType: string;
  message: string;
  createdAt: string;
  undoneAt: string | null;
};

export type RaceReview = {
  id: string;
  eventId: string;
  athleteKey: string;
  reviewType: string;
  overallTime: string;
  averageRunPace: string;
  transitionTime: string;
  rpe: number | null;
  feel: number | null;
  notes: string;
  stationTimes: Record<string, string>;
  reflection: Record<string, string>;
};

export type TrainingBlock = {
  id: string;
  teamId: string;
  name: string;
  startDate: string;
  endDate: string;
  trainingGoal: string;
  status: string;
  notes: string;
};

export type Phase = {
  id: string;
  blockId: string;
  name: string;
  startDate: string;
  endDate: string;
  focus: string;
  sortOrder: number;
};

export type ConsistencyWeek = {
  weekId: string;
  startDate: string;
  title: string;
  targets: { hard: number; strength: number; easy: number };
  planned: { hard: number; strength: number; easy: number };
  completed: { hard: number; strength: number; easy: number };
  consecutiveHard: boolean;
};

export type WeekTypeInfo = {
  label: string;
  rationale: string;
  targets: { hard: number; strength: number; easy: number };
};

export type V2TrainingFocus = {
  id: string;
  name: string;
  purpose: string;
  defaultPrescription: string;
  primaryMuscles: string;
  hyroxLinks: string[];
  programmingNotes: string;
  isBuiltIn: boolean;
  active: boolean;
};

export type V2CatalogueExercise = {
  id: string;
  name: string;
  family: string;
  trainingFocus: string;
  secondaryFocus: string | null;
  tier: string;
  defaultVisibility: string;
  focusRank: number;
  primaryEquipment: string;
  secondaryEquipment: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string;
  helpsWith: string[];
  directHyrox: boolean;
  prescription: string;
  loadConvention: string;
  defaultIncrementKg: number | null;
  demoUrl: string | null;
  explanationUrl: string | null;
  legacyExerciseId: string | null;
};

export type TrainingLocation = {
  id: string;
  name: string;
  notes: string;
  equipment: string[];
  active: boolean;
};

export type StrengthBuilderSlot = {
  id: string;
  templateId: string;
  focusId: string;
  focusName: string;
  exerciseId: string | null;
  exerciseName: string | null;
  prescription: string;
  sortOrder: number;
  notes: string;
};

export type StrengthBuilderTemplate = {
  id: string;
  name: string;
  purpose: string;
  isBuiltIn: boolean;
  slots: StrengthBuilderSlot[];
};

export type ProgressionTrack = {
  id: string;
  name: string;
  purpose: string;
  isBuiltIn: boolean;
  currentStep: number;
  togetherPending: boolean;
  steps: Array<{ id: string; title: string; prescription: string; workoutId: string | null; sortOrder: number }>;
};

export type WeekTypeTemplate = {
  id: string;
  name: string;
  rationale: string;
  hardTarget: number;
  strengthTarget: number;
  easyTarget: number;
  defaultLocationId: string | null;
  priorityEmphasis: string;
  isBuiltIn: boolean;
  intents: Array<{ id: string; day: number; intent: string; workoutId: string | null; strengthTemplateId: string | null; progressionTrackId: string | null; locationId: string | null; priorityEmphasis: string }>;
};

export type ProgrammeRecommendation = {
  id: string;
  weekId: string;
  phaseId: string | null;
  weekTypeId: string | null;
  progressionTrackId: string | null;
  title: string;
  rationale: string;
  qualityIntent: string;
};

export type V2Data = {
  trainingFocuses: V2TrainingFocus[];
  catalogue: V2CatalogueExercise[];
  locations: TrainingLocation[];
  currentLocationId: string | null;
  priorities: Record<string, string[]>;
  strengthTemplates: StrengthBuilderTemplate[];
  progressionTracks: ProgressionTrack[];
  weekTypeTemplates: WeekTypeTemplate[];
  programmeRecommendations: ProgrammeRecommendation[];
};

export type AppData = {
  needsProfileClaim: false;
  actor: AthleteSummary;
  partner: AthleteSummary | null;
  athletes: AthleteSummary[];
  block: TrainingBlock;
  blocks: TrainingBlock[];
  phase: Phase | null;
  phases: Phase[];
  events: TrainingEvent[];
  weeks: PlannedWeek[];
  week: PlannedWeek;
  originalPlan: OriginalSession[];
  sessions: Session[];
  totals: Record<string, TargetTotals>;
  consistency: Record<string, ConsistencyWeek[]>;
  feed: FeedItem[];
  workoutLibrary: LibraryItem[];
  planHistory: PlanHistoryItem[];
  strengthDefinitions: StrengthDefinition[];
  exerciseHistory: ProgressHistory[];
  progress: Record<string, ProgressState[]>;
  recentSessions: Array<{
    id: string;
    athleteId: string;
    title: string;
    category: Category;
    completedAt: string | null;
    rpe: number | null;
    feel: number | null;
    averagePace: string | null;
    totalTime: string | null;
    distance: number | null;
    rounds: number | null;
    reps: number | null;
    calories: number | null;
    customValue: number | null;
    workoutTemplateId: string | null;
  }>;
  raceReviews: RaceReview[];
  weekTypes: Record<string, WeekTypeInfo>;
  serverDate: string;
  coachAvailable: boolean;
  v2: V2Data;
};

export type ClaimData = {
  needsProfileClaim: true;
  authenticatedName: string;
  availableProfiles: Array<{ id: string; displayName: string }>;
};

export type AppPayload = AppData | ClaimData;

export type Mutate = (
  payload: Record<string, unknown>,
  successMessage?: string,
) => Promise<{ ok?: boolean; undoToken?: string; [key: string]: unknown }>;
