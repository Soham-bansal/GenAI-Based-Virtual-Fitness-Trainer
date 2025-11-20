// src/storage.ts
import type {
  ActiveSessionState,
  DailyActivityEntry,
  DailyActivityMap,
} from "./types";

const ACTIVE_SESSION_KEY = "vft_active_session_v1";
const DAILY_ACTIVITY_KEY = "vft_daily_activity_v1";

// ---------- Active session helpers ----------

export function loadActiveSessionState(): ActiveSessionState | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSessionState;
  } catch {
    return null;
  }
}

export function saveActiveSessionState(state: ActiveSessionState | null) {
  if (!state) {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(state));
}

// ---------- Daily activity helpers ----------

export function loadDailyActivity(): DailyActivityMap {
  try {
    const raw = localStorage.getItem(DAILY_ACTIVITY_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DailyActivityMap;
  } catch {
    return {};
  }
}

export function saveDailyActivity(map: DailyActivityMap) {
  localStorage.setItem(DAILY_ACTIVITY_KEY, JSON.stringify(map));
}

function todayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Call this when a session is completed for that day
export function addSessionToDailyActivity(totalReps: number) {
  const map = loadDailyActivity();
  const key = todayKey();

  const existing: DailyActivityEntry = map[key] ?? {
    date: key,
    totalReps: 0,
    sessions: 0,
  };

  existing.totalReps += totalReps;
  existing.sessions += 1;

  map[key] = existing;
  saveDailyActivity(map);
}
