import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import type { PoseSnapshot } from "../types";

type CoachEventType =
  | "START_SESSION"
  | "POSE_ERROR"
  | "SET_DONE"
  | "SESSION_DONE"
  | "REP_PROGRESS"
  | "GENERIC";

type Viseme =
  | "rest"
  | "small_open"
  | "wide"
  | "round"
  | "closed"
  | "big_open";

interface CoachMessage {
  text: string;
  emotion: string;
  animation: string;
}

interface TrainerAvatarProps {
  userName?: string;
  exercise: string;
  lastWarning: string | null;
  lastSetSummary: { setNo: number; totalReps: number } | null;
  sessionPhase: "intro" | "active" | "completed";
  workoutPlanText: string;
  sessionStartTrigger: number;
  sessionCompleteTrigger: number;

  repInSet: number | null;
  currentSetNo: number;
  exerciseIndex: number;
  totalExercises: number;
  totalSetsForExercise: number;
  poseSnapshot: PoseSnapshot | null;

  targetRepsPerSet: number;
  onPoseCorrectionFinished?: () => void;
}

const TrainerAvatar: React.FC<TrainerAvatarProps> = ({
  userName = "Soham",
  exercise,
  lastWarning,
  lastSetSummary,
  sessionPhase,
  workoutPlanText,
  sessionStartTrigger,
  sessionCompleteTrigger,
  repInSet,
  currentSetNo,
  exerciseIndex,
  totalExercises,
  totalSetsForExercise,
  poseSnapshot,
  targetRepsPerSet,
  onPoseCorrectionFinished,
}) => {
  const [currentText, setCurrentText] = useState<string>(
    "Hi, I’m your AI coach!"
  );
  const [isTalking, setIsTalking] = useState(false);
  const [viseme, setViseme] = useState<Viseme>("rest");

  const prevSetNoRef = useRef<number | null>(null);
  const prevRepInSetRef = useRef<number | null>(null);

  const requestIdRef = useRef(0); // drop stale LLM responses

  const mapCharToViseme = (ch: string): Viseme => {
    const c = ch.toLowerCase();
    if ("aeiou".includes(c)) return "big_open";
    if ("bmp".includes(c)) return "closed";
    if ("fv".includes(c)) return "small_open";
    if ("o".includes(c)) return "round";
    if ("szcj".includes(c)) return "wide";
    return "small_open";
  };

  // fast local rep counter voice (no LLM)
  const speakRepNumberLocal = (rep: number) => {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(rep.toString());
    utter.lang = "en-US";
    utter.rate = 1.1;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  };

  const speakWithLipSync = (text: string, onFinish?: () => void) => {
    if (!("speechSynthesis" in window)) {
      alert("Speech Synthesis not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 1.0;
    utter.pitch = 1.0;

    utter.onstart = () => {
      setIsTalking(true);
      setViseme("small_open");
    };

    utter.onboundary = (event) => {
      if (event.charIndex != null && event.charIndex < text.length) {
        const ch = text[event.charIndex] || " ";
        const newViseme = mapCharToViseme(ch);
        setViseme(newViseme);
      }
    };

    utter.onend = () => {
      setIsTalking(false);
      setViseme("rest");
      if (onFinish) onFinish();
    };

    utter.onerror = () => {
      setIsTalking(false);
      setViseme("rest");
      if (onFinish) onFinish();
    };

    window.speechSynthesis.speak(utter);
  };

  const askCoach = async (eventType: CoachEventType) => {
    const requestId = ++requestIdRef.current;

    try {
      const payload: any = {
        event_type: eventType,
        user_name: userName,
        exercise,
        warning: lastWarning ?? null,
        reps: lastSetSummary?.totalReps ?? null,
        plan_summary: workoutPlanText,
        rep_in_set: repInSet,
        set_index: currentSetNo,
        total_sets_for_exercise: totalSetsForExercise,
        exercise_index: exerciseIndex,
        total_exercises: totalExercises,
        pose_snapshot: poseSnapshot,
        target_reps_per_set: targetRepsPerSet,
      };
      
      if (eventType === "POSE_ERROR" && poseSnapshot) {
        if(exercise==="jumping_jacks"){
          payload.angles={
            arm_raise_angle: poseSnapshot.armRaiseAngle ?? null,
            leg_spread_ratio: poseSnapshot.legSpreadRatio ?? null,
          };
        } else {
          payload.angles={
            left_knee: poseSnapshot.kneeAngle ?? null,
            right_knee: poseSnapshot.kneeAngle ?? null,
            back_angle: poseSnapshot.backAngle ?? null,
          };
        }
        payload.joints={
          shoulder:
            poseSnapshot.centerShoulderX !=null &&
            poseSnapshot.centerShoulderY !=null
              ? [poseSnapshot.centerShoulderX, poseSnapshot.centerShoulderY]
              : null,
          hip:
            poseSnapshot.centerHipX !=null &&
            poseSnapshot.centerHipY !=null
              ? [poseSnapshot.centerHipX, poseSnapshot.centerHipY]
              : null,
        };

        payload.realtime_state={
          is_down_phase: poseSnapshot.phase === "down",
          rep_no: repInSet,
          set_no: currentSetNo,
        };
      }

      const res = await axios.post<CoachMessage>(
        "http://localhost:8000/coach/message",
        payload
      );

      if (requestId !== requestIdRef.current) {
        return;
      }

      const msg = res.data;
      setCurrentText(msg.text);

      const after =
        eventType === "POSE_ERROR" ? onPoseCorrectionFinished : undefined;
      speakWithLipSync(msg.text, after);
    } catch (err) {
      console.error("Coach API error: ", err);

      if (requestId !== requestIdRef.current) {
        return;
      }

      const fallback =
        eventType === "SESSION_DONE"
          ? "Great job today. Your session is complete. Drink some water and do light stretching."
          : "Keep going, your form is improving every rep!";
      setCurrentText(fallback);

      const after =
        eventType === "POSE_ERROR" ? onPoseCorrectionFinished : undefined;
      speakWithLipSync(fallback, after);
    }
  };

  // ---------- auto reactions ----------

  // session start
  useEffect(() => {
    if (sessionPhase !== "active") return;
    askCoach("START_SESSION");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStartTrigger]);

  // pose error -> correction
  useEffect(() => {
    if (!lastWarning) return;
    if (sessionPhase !== "active") return;
    askCoach("POSE_ERROR");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastWarning]);

  // set done
  useEffect(() => {
    if (!lastSetSummary) return;
    if (sessionPhase !== "active") return;
    const { setNo } = lastSetSummary;
    if (prevSetNoRef.current === setNo) return;
    prevSetNoRef.current = setNo;
    askCoach("SET_DONE");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSetSummary]);

  // reps: local count every rep, LLM every 2 reps + last 2 reps
  useEffect(() => {
    if (sessionPhase !== "active") return;
    if (repInSet == null) return;
    if (repInSet === prevRepInSetRef.current) return;
    prevRepInSetRef.current = repInSet;

    // instant local counter
    speakRepNumberLocal(repInSet);

    const remaining = targetRepsPerSet - repInSet;

    // LLM motivation every 2 reps
    if (repInSet % 2 === 0) {
      askCoach("REP_PROGRESS");
      return;
    }

    // also emphasize last two reps
    if (remaining === 2 || remaining === 1) {
      askCoach("REP_PROGRESS");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repInSet]);

  // session done
  useEffect(() => {
    if (sessionPhase !== "completed") return;
    askCoach("SESSION_DONE");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCompleteTrigger]);

  const mouthStyleBase: React.CSSProperties = {
    transition: "all 0.05s linear",
    backgroundColor: "#111",
    margin: "0 auto",
  };

  const mouthStyleByViseme: Record<Viseme, React.CSSProperties> = {
    rest: { width: "50px", height: "6px", borderRadius: "999px" },
    small_open: { width: "40px", height: "14px", borderRadius: "999px" },
    big_open: { width: "50px", height: "24px", borderRadius: "999px" },
    wide: { width: "60px", height: "10px", borderRadius: "999px" },
    round: { width: "26px", height: "20px", borderRadius: "999px" },
    closed: { width: "36px", height: "4px", borderRadius: "999px" },
  };

  const combinedMouthStyle: React.CSSProperties = {
    ...mouthStyleBase,
    ...mouthStyleByViseme[viseme],
  };

  return (
    <div
      style={{
        width: "360px",           // a bit wider so text has space
        maxWidth: "100%",
        background: "#020617",
        borderRadius: "16px",
        padding: "16px",
        color: "white",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        boxShadow: "0 0 15px rgba(0,0,0,0.6)",
      }}
    >
      <h3 style={{ fontSize: "18px", marginBottom: "4px" }}>
        Trainer Avatar
      </h3>

      {/* row: avatar + message */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          width: "100%",
        }}
      >
        {/* Avatar circle */}
        <div
          style={{
            width: "120px",
            height: "120px",
            borderRadius: "999px",
            background: "#facc15",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "36px",
              left: "32px",
              width: "16px",
              height: "16px",
              borderRadius: "999px",
              background: "#111827",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "36px",
              right: "32px",
              width: "16px",
              height: "16px",
              borderRadius: "999px",
              background: "#111827",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "26px",
            }}
          >
            <div style={combinedMouthStyle}></div>
          </div>
        </div>

        {/* Message bubble */}
        <div
          style={{
            background: "#0f172a",
            borderRadius: "12px",
            padding: "8px 10px",
            fontSize: "13px",
            minHeight: "40px",
            flex: 1,                // 🔥 grow to the right when text is long
          }}
        >
          <strong>{isTalking ? "Speaking:" : "Last message:"}</strong>
          <div style={{ marginTop: "4px" }}>{currentText}</div>
        </div>
      </div>
    </div>
  );

};

export default TrainerAvatar;
