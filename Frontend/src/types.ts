// src/types.ts

export type ExerciseId =
  | "squats"
  | "jumping_jacks"
  | "pushups"
  | "lunges"
  | "plank";

export type PoseSnapshot = {
  exerciseId: ExerciseId;

  // generic
  phase?: string; // "down", "up", etc.

  // ---- Squats-specific ----
  kneeAngle?: number;
  backAngle?: number;
  depthTooShallow?: boolean;
  backTooLeaned?: boolean;
  kneesCavingIn?: boolean;
  stanceTooNarrow?: boolean;
  centerShoulderX?: number;
  centerShoulderY?: number;
  centerHipX?: number;
  centerHipY?: number;

  // placeholders for other exercises (we'll use later)
  armRaiseAngle?: number;
  legSpreadRatio?: number;
  armsNotHighEnough?: boolean;
  legsNotWideEnough?: boolean;
  armsLegsOutOfSync?: boolean;

  elbowAngle?: number;
  bodyStraightnessAngle?: number;
  depthTooShallowPushup?: boolean;
  hipsSagging?: boolean;
  hipsTooHigh?: boolean;
  elbowsTooFlared?: boolean;

  frontKneeAngle?: number;
  backKneeAngle?: number;
  frontKneePastToe?: boolean;
  backKneeTooHigh?: boolean;
  torsoTooForwardLunge?: boolean;
  balanceUnstable?: boolean;

  plankHipAngle?: number;
  plankHipsSagging?: boolean;
  plankHipsTooHigh?: boolean;
  plankShoulderNotStacked?: boolean;
};


export type SessionPhase = "intro" | "active" | "completed";

// What we save in localStorage to resume the session in the same day
export interface ActiveSessionState {
  sessionPhase: SessionPhase;              // "intro" | "active"
  currentExerciseIndex: number;           // for future multi-exercise support
  setNo: number;
  reps: number;
  repInSet: number | null;
  startedAt: string;                      // ISO date-time string
}

// One row in the "daily activity" log
export interface DailyActivityEntry {
  date: string;       // "YYYY-MM-DD"
  totalReps: number;  // total reps done that day
  sessions: number;   // number of sessions finished that day
}

// Map of all days -> their activity
export type DailyActivityMap = Record<string, DailyActivityEntry>;