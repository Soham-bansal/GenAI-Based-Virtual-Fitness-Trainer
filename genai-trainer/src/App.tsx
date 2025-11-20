// src/App.tsx
import { useEffect, useState } from "react";
import PoseDetector from "./components/PoseDetector";
import TrainerAvatar from "./components/TrainerAvatar";
import type { PoseSnapshot } from "./types";
import {
  loadActiveSessionState,
  saveActiveSessionState,
  addSessionToDailyActivity,
} from "./storage";
import Dashboard from "./components/Dashboard";

type WorkoutExercise = {
  id: "squats" | "jumping_jacks" | "pushups" | "lunges" | "plank";
  name: string;
  sets: number;
  reps: number;
  bodyPart: string;
};

const workoutPlan: WorkoutExercise[] = [
   {
    id: "squats",
    name: "Bodyweight Squats",
    sets: 3,
    reps: 12,
    bodyPart: "legs & glutes",
  },
  {
    id: "jumping_jacks",
    name: "Jumping Jacks",
    sets: 3,
    reps: 20,
    bodyPart: "full body, cardio",
  },
 
];

type SessionPhase = "intro" | "active" | "completed";
type View = "session" | "dashboard";

function App() {
  // Start directly on Workout view
  const [view, setView] = useState<View>("session");

  const [reps, setReps] = useState(0);
  const [setNo, setSetNo] = useState(1);
  const [repInSet, setRepInSet] = useState<number | null>(null);

  const [lastWarning, setLastWarning] = useState<string | null>(null);
  const [lastSetSummary, setLastSetSummary] = useState<{
    setNo: number;
    totalReps: number;
  } | null>(null);

  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("intro");
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [poseSessionKey, setPoseSessionKey] = useState(0);
  const [avatarKey, setAvatarKey] = useState(0);   // NEW
  const [sessionStartTrigger, setSessionStartTrigger] = useState(0);
  const [sessionCompleteTrigger, setSessionCompleteTrigger] = useState(0);

  const [poseSnapshot, setPoseSnapshot] = useState<PoseSnapshot | null>(null);

  const [repLocked, setRepLocked] = useState(false);

  // NEW: overlay when user presses "Stop session"
  const [stopOverlayVisible, setStopOverlayVisible] = useState(false);

  const currentExercise = workoutPlan[currentExerciseIndex];
  const targetRepsPerSet = currentExercise.reps;


  const formStatus = lastWarning ? "Needs correction" : "Good 👍";
  const formStatusColor = lastWarning ? "#f87171" : "#4ade80";

  const workoutPlanText = workoutPlan
    .map(
      (ex, idx) =>
        `${idx + 1}. ${ex.name} – ${ex.sets} sets × ${ex.reps} reps (${ex.bodyPart})`
    )
    .join("\n");

  // ---------- Restore active session (same day only) ----------
  useEffect(() => {
    const saved = loadActiveSessionState();
    if (!saved) return;

    const savedDate = saved.startedAt.split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    if (savedDate !== today) return;

    if (saved.sessionPhase === "active") {
      setSessionPhase("active");
      setCurrentExerciseIndex(saved.currentExerciseIndex ?? 0);
      setSetNo(saved.setNo);
      setReps(saved.reps);
      setRepInSet(saved.repInSet);
      setView("session");
    }
  }, []);

  // ---------- Continuously save active session ----------
  useEffect(() => {
    if (sessionPhase !== "active") {
      saveActiveSessionState(null);
      return;
    }

    const prev = loadActiveSessionState();
    const startedAt = prev?.startedAt ?? new Date().toISOString();

    saveActiveSessionState({
      sessionPhase,
      currentExerciseIndex,
      setNo,
      reps,
      repInSet,
      startedAt,
    });
  }, [sessionPhase, currentExerciseIndex, setNo, reps, repInSet]);

  const handleWarningChange = (msg: string | null) => {
    setLastWarning(msg);
    if (msg) {
      setRepLocked(true);
    }
  };

  const handlePoseCorrectionFinished = () => {
    setRepLocked(false);
    setLastWarning(null);
  };

  const handleRepsChange = (totalReps: number) => {
    setReps(totalReps);
    const repInCurrentSet =
      ((totalReps - 1) % targetRepsPerSet) + 1;
    setRepInSet(repInCurrentSet);
  };

  const handleSetComplete = (completedSetNo: number, totalReps: number) => {
    setLastSetSummary({ setNo: completedSetNo, totalReps });
  };

  const handleSetChange = (newSetNo: number) => {
  setSetNo(newSetNo);

  // if we still have sets left for this exercise, just continue
  if (newSetNo <= currentExercise.sets) {
    return;
  }

  // current exercise finished
  const isLastExercise = currentExerciseIndex === workoutPlan.length - 1;

  if (isLastExercise) {
    // ✅ whole workout done
    setSessionPhase("completed");
    setSessionCompleteTrigger((t) => t + 1);

    addSessionToDailyActivity(reps);
    saveActiveSessionState(null);
  } else {
    // ▶️ move to next exercise, keep session active
    const nextIndex = currentExerciseIndex + 1;
    const nextExercise = workoutPlan[nextIndex];

    setCurrentExerciseIndex(nextIndex);
    setSetNo(1);
    setReps(0);
    setRepInSet(null);
    setLastWarning(null);
    setRepLocked(false);

    // optional: keep same startedAt so whole day's workout is one session
    const prev = loadActiveSessionState();
    const startedAt = prev?.startedAt ?? new Date().toISOString();

    saveActiveSessionState({
      sessionPhase: "active",
      currentExerciseIndex: nextIndex,
      setNo: 1,
      reps: 0,
      repInSet: null,
      startedAt,
    });
    }
  };


  const handleStartSessionClick = () => {
    setSessionPhase("active");
    setSessionStartTrigger((t) => t + 1);
    setView("session");
  };

  const handleUserSkipCorrection = () => {
  // stop current speech if any
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  // unlock reps and clear warning
  setRepLocked(false);
  setLastWarning(null);
  };

  const handleHardResetToday = () => {
    const ok = window.confirm(
      "This will reset today's session progress and start fresh. Continue?"
    );
    if (!ok) return;

    // 1) Cancel any ongoing speech from avatar
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    // 2) Clear active session from localStorage
    saveActiveSessionState(null);

    // 3) Reset all session-related React state
    setReps(0);
    setSetNo(1);
    setRepInSet(null);
    setLastWarning(null);
    setLastSetSummary(null);
    setSessionPhase("intro");
    setPoseSnapshot(null);
    setRepLocked(false);

    // (optional but clean) reset triggers
    // so effects behave like a brand new day
    // setSessionStartTrigger(0);
    // setSessionCompleteTrigger(0);

    // make sure we’re on the workout view
    setView("session");

    // 4) Force PoseDetector & TrainerAvatar to remount
    setPoseSessionKey((k) => k + 1);
    setAvatarKey((k) => k + 1);
  };



  // NEW: stop (pause) session – keep state & show overlay
  const handleStopSessionNow = () => {
    if (sessionPhase !== "active") return;
    setStopOverlayVisible(true);
  };

  const closeStopOverlayAndContinue = () => {
    setStopOverlayVisible(false);
  };

  const goToDashboardFromStopOverlay = () => {
    setStopOverlayVisible(false);
    setView("dashboard");
  };

  return (
    <div
      style={{
        background: "#020617",
        minHeight: "100vh",
        padding: "16px",
        color: "white",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h1 style={{ fontSize: "22px" }}>GenAI Virtual Trainer</h1>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {/* view toggle */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setView("session")}
              style={{
                padding: "6px 12px",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                background: view === "session" ? "#22c55e" : "#111827",
                color: "white",
              }}
            >
              Workout
            </button>
            <button
              onClick={() => setView("dashboard")}
              style={{
                padding: "6px 12px",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                background: view === "dashboard" ? "#22c55e" : "#111827",
                color: "white",
              }}
            >
              Dashboard
            </button>
          </div>

          {/* stop button shown only while active */}
          {sessionPhase === "active" && (
            <>
              <button
                onClick={handleStopSessionNow}
                style={{
                  background: "#ef4444",
                  color: "white",
                  padding: "6px 14px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                Stop session for now
              </button>
              <span
                style={{
                  fontSize: "12px",
                  opacity: 0.75,
                }}
              >
                Progress is saved for today. You can resume later.
              </span>
            </>
          )}
        </div>
      </div>


      {/* ---------- SESSION VIEW ---------- */}
      {view === "session" && (
        <>
          <h2 style={{ marginBottom: "6px", fontSize: "18px" }}>
            Daily Session
          </h2>

          <div
            style={{
              marginBottom: "10px",
              fontSize: "14px",
              opacity: 0.9,
            }}
          >
            <div>
              <strong>
                Exercise {currentExerciseIndex + 1}/{workoutPlan.length}:
              </strong>{" "}
              {currentExercise.name}
            </div>
            <div>
              <strong>Set:</strong> {setNo}/{currentExercise.sets} &nbsp;•&nbsp;
              <strong>Target:</strong> {currentExercise.reps} reps
            </div>
          </div>

          {/* Centering wrapper */}
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",   // <-- centers the whole row 👌
              marginTop: "10px",
            }}
          >
            {/* Main row */}
            <div
              style={{
                display: "flex",
                gap: "20px",
                alignItems: "flex-start",
              }}
            >
              {/* LEFT: Camera Feed */}
              <PoseDetector
                key={poseSessionKey}
                exerciseId={currentExercise.id}
                exerciseName={currentExercise.name}
                targetRepsPerSet={targetRepsPerSet}
                onRepsChange={handleRepsChange}
                onSetChange={handleSetChange}
                onWarningChange={handleWarningChange}
                onSetComplete={handleSetComplete}
                onPoseSnapshotChange={setPoseSnapshot}
                canCountReps={!repLocked}
                initialReps={reps}          // 🔵 NEW
                initialSetNo={setNo} 
                onUserSkipCorrection={handleUserSkipCorrection}     
              />

              {/* RIGHT: Info + Avatar */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  width: "360px",
                  flexShrink: 0,
                }}
              >
                {/* Session Info card */}
                <div
                  style={{
                    width: "100%",
                    background: "#111827",
                    borderRadius: "12px",
                    padding: "14px",
                    boxShadow: "0 0 10px rgba(0,0,0,0.5)",
                    color: "white",
                  }}
                >
                  <h3 style={{ marginBottom: "8px", fontSize: "18px" }}>
                    Session Info
                  </h3>
                  <p><strong>Exercise:</strong> {currentExercise.name}</p>
                  <p><strong>Set:</strong> {setNo}/{currentExercise.sets}</p>
                  <p><strong>Reps this session:</strong> {reps}</p>
                  <p><strong>Target reps per set:</strong> {targetRepsPerSet}</p>
                  <p style={{ marginTop: "10px" }}>
                    <strong>Form status:</strong>{" "}
                    <span style={{ color: formStatusColor }}>{formStatus}</span>
                  </p>
                  {lastWarning && (
                    <p
                      style={{
                        marginTop: "8px",
                        fontSize: "14px",
                        color: "#fda4af",
                      }}
                    >
                      Tip: {lastWarning}
                    </p>
                  )}
                </div>

                <TrainerAvatar
                  key={avatarKey}
                  userName="Soham"
                  exercise={currentExercise.name}
                  lastWarning={lastWarning}
                  lastSetSummary={lastSetSummary}
                  sessionPhase={sessionPhase}
                  workoutPlanText={workoutPlanText}
                  sessionStartTrigger={sessionStartTrigger}
                  sessionCompleteTrigger={sessionCompleteTrigger}
                  repInSet={repInSet}
                  currentSetNo={setNo}
                  exerciseIndex={currentExerciseIndex + 1}
                  totalExercises={workoutPlan.length}
                  totalSetsForExercise={currentExercise.sets}
                  poseSnapshot={poseSnapshot}
                  targetRepsPerSet={targetRepsPerSet}
                  onPoseCorrectionFinished={handlePoseCorrectionFinished}
                />
              </div>
            </div>
          </div>

          {/* Debug info */}
          <div
            style={{
              marginTop: "12px",
              fontSize: "13px",
              opacity: 0.8,
            }}
          >
            <div>Phase: {sessionPhase}</div>
            <div>Set: {setNo}</div>
            <div>Reps (this exercise): {reps}</div>
            <div>Rep in current set: {repInSet ?? "-"}</div>
            <div>Last warning: {lastWarning ?? "none"}</div>
            <div>Reps locked: {repLocked ? "yes" : "no"}</div>
          </div>
          {/* Backdoor reset button */}
          <div style={{ marginTop: "10px" }}>
            <button
              onClick={handleHardResetToday}
              style={{
                background: "transparent",
                color: "#f97373",
                border: "1px solid #f97373",
                padding: "4px 10px",
                borderRadius: "999px",
                fontSize: "12px",
                cursor: "pointer",
                opacity: 0.85,
              }}
            >
              Reset today&apos;s session
            </button>
          </div>

          {/* Intro overlay */}
          {sessionPhase === "intro" && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.7)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 60,
              }}
            >
              <div
                style={{
                  background: "#020617",
                  borderRadius: "18px",
                  padding: "20px 22px",
                  maxWidth: "520px",
                  width: "90%",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
                  border: "1px solid #22c55e",
                }}
              >
                <h2
                  style={{
                    fontSize: "20px",
                    marginBottom: "10px",
                  }}
                >
                  Today&apos;s Workout Plan
                </h2>
                <ul
                  style={{
                    fontSize: "14px",
                    marginLeft: "18px",
                    marginBottom: "12px",
                  }}
                >
                  {workoutPlan.map((ex, idx) => (
                    <li key={ex.id} style={{ marginBottom: "4px" }}>
                      <strong>
                        {idx + 1}. {ex.name}
                      </strong>{" "}
                      – {ex.sets} sets × {ex.reps} reps ({ex.bodyPart})
                    </li>
                  ))}
                </ul>
                <p
                  style={{
                    fontSize: "13px",
                    opacity: 0.9,
                    marginBottom: "12px",
                  }}
                >
                  When you hit start, your virtual trainer will greet you and
                  guide you through each exercise in real time. Keep your camera
                  on and follow the instructions closely.
                </p>
                <button
                  onClick={handleStartSessionClick}
                  style={{
                    background: "#22c55e",
                    color: "white",
                    padding: "8px 16px",
                    borderRadius: "999px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  Start Session
                </button>
              </div>
            </div>
          )}

          {/* Completed overlay */}
          {sessionPhase === "completed" && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.7)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 60,
              }}
            >
              <div
                style={{
                  background: "#020617",
                  borderRadius: "18px",
                  padding: "20px 22px",
                  maxWidth: "420px",
                  width: "90%",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
                  border: "1px solid #22c55e",
                }}
              >
                <h2
                  style={{
                    fontSize: "20px",
                    marginBottom: "10px",
                  }}
                >
                  Session Completed 🎉
                </h2>
                <p
                  style={{
                    fontSize: "14px",
                    marginBottom: "8px",
                  }}
                >
                  For now, you&apos;ve finished your  routine for today.
                </p>
                <p
                  style={{
                    fontSize: "13px",
                    opacity: 0.9,
                  }}
                >
                  Your trainer will give you a final wrap-up. Don&apos;t forget
                  to hydrate and stretch lightly.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- DASHBOARD VIEW ---------- */}
      {view === "dashboard" && (
        <div style={{ marginTop: "8px" }}>
          <Dashboard />
        </div>
      )}

      {/* ---------- STOP OVERLAY ---------- */}
      {stopOverlayVisible && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 70,
          }}
        >
          <div
            style={{
              background: "#020617",
              borderRadius: "18px",
              padding: "20px 22px",
              maxWidth: "480px",
              width: "90%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
              border: "1px solid #ef4444",
            }}
          >
            <h2
              style={{
                fontSize: "20px",
                marginBottom: "10px",
              }}
            >
              Session paused ✅
            </h2>
            <p
              style={{
                fontSize: "14px",
                marginBottom: "8px",
              }}
            >
              Your progress for today is saved. You can safely close this tab or
              come back later – the workout will resume from this set and rep.
            </p>
            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "12px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={closeStopOverlayAndContinue}
                style={{
                  background: "#22c55e",
                  color: "white",
                  padding: "8px 16px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                Continue session
              </button>
              <button
                onClick={goToDashboardFromStopOverlay}
                style={{
                  background: "#111827",
                  color: "white",
                  padding: "8px 16px",
                  borderRadius: "999px",
                  border: "1px solid #374151",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                Go to dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
