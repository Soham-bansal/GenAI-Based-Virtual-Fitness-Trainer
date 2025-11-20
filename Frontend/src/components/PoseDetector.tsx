import React, { useEffect, useRef, useState } from "react";
// import { Pose, POSE_CONNECTIONS } from "@mediapipe/pose";
// import { Camera } from "@mediapipe/camera_utils";
// import * as drawing from "@mediapipe/drawing_utils";
import type { PoseSnapshot, ExerciseId } from "../types";
import squatGif from "../assets/squat.gif"
import jumpingJacksGif from "../assets/jumping_jacks.gif";


type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

// These come from <script> tags in index.html (CDN)
declare const Pose: any;
declare const Camera: any;
declare const POSE_CONNECTIONS: readonly [number, number][];

declare function drawConnectors(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  connections: readonly [number, number][],
  style?: any
): void;

declare function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: any[],
  style?: any
): void;

let globalPose:any|null = null;
function getGlobalPoseInstance() {
  if(!globalPose) {
    globalPose = new Pose({
      locateFile: (file: string) =>
         `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.2/${file}`,
    });

    globalPose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });
  }
  return globalPose;
}


interface PoseDetectorProps {
  exerciseId: ExerciseId;
  exerciseName: string;
  targetRepsPerSet: number;
  onRepsChange: (reps: number) => void;
  onSetChange: (setNo: number) => void;
  onWarningChange: (warning: string | null) => void;
  onSetComplete?: (setNo: number, totalReps: number) => void;
  onPoseSnapshotChange?: (snapshot: PoseSnapshot | null) => void;
  canCountReps: boolean; // false = reps locked until LLM finishes correction
  initialReps?: number;
  initialSetNo?: number;
  onUserSkipCorrection?: () => void;
}

// ---------- helper math ----------

function angleBetweenPoints(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const acx = c.x - b.x;
  const acy = c.y - b.y;

  const dot = abx * acx + aby * acy;
  const magAB = Math.sqrt(abx * abx + aby * aby);
  const magAC = Math.sqrt(acx * acx + acy * acy);

  if (magAB === 0 || magAC === 0) return 180;

  const cos = dot / (magAB * magAC);
  const clamped = Math.max(-1, Math.min(1, cos));
  const rad = Math.acos(clamped);
  return (rad * 180) / Math.PI;
}

// angle between shoulder-hip vector and vertical
function backLeanAngle(shoulder: Landmark, hip: Landmark): number {
  const dx = hip.x - shoulder.x;
  const dy = hip.y - shoulder.y;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return 0;

  const cos = dy / mag;
  const clamped = Math.max(-1, Math.min(1, cos));
  const rad = Math.acos(clamped);
  return (rad * 180) / Math.PI; // 0 = vertical
}

const PoseDetector: React.FC<PoseDetectorProps> = ({
  exerciseId,
  exerciseName,
  targetRepsPerSet,
  onRepsChange,
  onSetChange,
  onWarningChange,
  onSetComplete,
  onPoseSnapshotChange,
  canCountReps,
  initialReps,
  initialSetNo,
  onUserSkipCorrection, 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement>(null);

  const [localWarning, setLocalWarning] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [popupText, setPopupText] = useState("");

  // const popupTimeoutRef = useRef<number | null>(null);

  // squat state
  const isDownRef = useRef(false);
  const minKneeAngleRef = useRef(180);
  const badBackFramesRef = useRef(0);
  const repsRef = useRef(0);
  const setNoRef = useRef(1);


    // ---------- Jumping Jacks state ----------
  const jjIsOpenRef = useRef(false);          // currently in "open" phase of a jack
  const jjOpenFramesRef = useRef(0);          // how many frames stayed open
  const jjArmsEverHighRef = useRef(false);    // did arms reach high enough at any point
  const jjLegsEverWideRef = useRef(false);    // did legs reach wide enough at any point
  const jjOutOfSyncRepRef = useRef(false);    // arms & legs out of sync during rep


    // keep internal counters in sync with parent when (re)mounting
  useEffect(() => {
    if (typeof initialReps === "number") {
      repsRef.current = initialReps;
    }
    if (typeof initialSetNo === "number") {
      setNoRef.current = initialSetNo;
    }
  }, [initialReps, initialSetNo]);


  // new refs
  const downFramesRef = useRef(0);

// flags describing form issues during the current rep
  const backBadThisRepRef = useRef(false);
  const kneesBadThisRepRef = useRef(false);
  const stanceBadThisRepRef = useRef(false);

  // keep latest canCountReps without recreating camera
  const canCountRepsRef = useRef<boolean>(canCountReps);
  useEffect(() => {
    canCountRepsRef.current = canCountReps;
  }, [canCountReps]);
   const initializedFromPropsRef = useRef(false);
  useEffect(() => {
    if (initializedFromPropsRef.current) return;

    if (typeof initialReps === "number" && initialReps > 0) {
      repsRef.current = initialReps;
    }
    if (typeof initialSetNo === "number" && initialSetNo > 1) {
      setNoRef.current = initialSetNo;
    }

    initializedFromPropsRef.current = true;
  }, [initialReps, initialSetNo]);

  const clearLocalWarning = () => {
    setLocalWarning(null);
    setShowPopup(false);
    onWarningChange(null);
  };


  const showLocalWarning = (msg: string) => {
    setLocalWarning(msg);
    setPopupText(msg);
    setShowPopup(true);
    onWarningChange(msg);
  };


  useEffect(() => {
    // when LLM finishes correction, App sets repLocked=false -> canCountReps=true
    // if we still have a warning then, hide popup + clear warning
    if (canCountReps && localWarning) {
      setShowPopup(false);
      setLocalWarning(null);
      onWarningChange(null);
    }
  }, [canCountReps, localWarning, onWarningChange]);


  // ---------- squat logic ----------
// ---------- SQUAT LOGIC (IMPROVED) ----------
  const updateSquatLogic = (landmarks: Landmark[]) => {
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];

    if (
      !leftHip ||
      !rightHip ||
      !leftKnee ||
      !rightKnee ||
      !leftAnkle ||
      !rightAnkle ||
      !leftShoulder ||
      !rightShoulder
    ) {
      onPoseSnapshotChange?.(null);
      return;
    }

    // ---- angles & basic metrics ----
    const kneeAngleLeft = angleBetweenPoints(leftHip, leftKnee, leftAnkle);
    const kneeAngleRight = angleBetweenPoints(rightHip, rightKnee, rightAnkle);
    const kneeAngle = (kneeAngleLeft + kneeAngleRight) / 2;

    const midShoulder: Landmark = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
      z: (leftShoulder.z + rightShoulder.z) / 2,
    };
    const midHip: Landmark = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      z: (leftHip.z + rightHip.z) / 2,
    };

    const backAngle = backLeanAngle(midShoulder, midHip); // 0 = vertical

    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const footWidth = Math.abs(leftAnkle.x - rightAnkle.x);
    const stanceTooNarrowInstant = footWidth < 0.6 * shoulderWidth; // feet too close

    const kneeMid = (leftKnee.x + rightKnee.x) / 2;
    const ankleMid = (leftAnkle.x + rightAnkle.x) / 2;
    const kneesCavingInInstant = Math.abs(kneeMid - ankleMid) > 0.08;

    // ---- thresholds (tune if needed) ----
    const DOWN_THRESHOLD = 140;          // entering squat when angle < this
    const UP_THRESHOLD = 165;            // standing when angle > this
    const GOOD_DEPTH_MAX_ANGLE = 110;    // min knee angle must go below this
    const MIN_DOWN_FRAMES = 6;           // must stay "down" at least this many frames
    const BACK_WARN_ANGLE = 40;          // back too bent if angle > this

    // ---- track down-phase state ----
    if (!isDownRef.current) {
      // currently standing / going down
      if (kneeAngle < DOWN_THRESHOLD) {
        // start a new squat "down" phase
        isDownRef.current = true;
        downFramesRef.current = 1;
        minKneeAngleRef.current = kneeAngle;

        backBadThisRepRef.current = false;
        kneesBadThisRepRef.current = false;
        stanceBadThisRepRef.current = false;
      } else {
        // still just standing -> send a simple snapshot
        const snapshot: PoseSnapshot = {
          exerciseId,
          phase: "up",
          kneeAngle,
          backAngle,
          depthTooShallow: false,
          backTooLeaned: false,
          kneesCavingIn: false,
          stanceTooNarrow: stanceTooNarrowInstant,
          centerShoulderX: midShoulder.x,
          centerShoulderY: midShoulder.y,
          centerHipX: midHip.x,
          centerHipY: midHip.y,
        };
        onPoseSnapshotChange?.(snapshot);
        return;
      }
    } else {
      // already in "down" phase for this rep
      downFramesRef.current += 1;

      if (kneeAngle < minKneeAngleRef.current) {
        minKneeAngleRef.current = kneeAngle;
      }

      // record any form issues that happen during down-phase
      if (backAngle > BACK_WARN_ANGLE) {
        backBadThisRepRef.current = true;
      }
      if (kneesCavingInInstant) {
        kneesBadThisRepRef.current = true;
      }
      if (stanceTooNarrowInstant) {
        stanceBadThisRepRef.current = true;
      }

      // if user comes back up -> possible end of rep
      if (kneeAngle > UP_THRESHOLD) {
        const depthTooShallow =
          minKneeAngleRef.current > GOOD_DEPTH_MAX_ANGLE;
        const stayedDownEnough =
          downFramesRef.current >= MIN_DOWN_FRAMES;
        const backTooLeaned = backBadThisRepRef.current;
        const kneesCavingIn = kneesBadThisRepRef.current;
        const stanceTooNarrow = stanceBadThisRepRef.current;

        const anyFormError =
          depthTooShallow ||
          !stayedDownEnough ||
          backTooLeaned ||
          kneesCavingIn ||
          stanceTooNarrow;

        // snapshot summarizing this rep
        const snapshot: PoseSnapshot = {
          exerciseId,
          phase: "up",
          kneeAngle: minKneeAngleRef.current, // min angle reached
          backAngle,
          depthTooShallow,
          backTooLeaned,
          kneesCavingIn,
          stanceTooNarrow,
          centerShoulderX: midShoulder.x,
          centerShoulderY: midShoulder.y,
          centerHipX: midHip.x,
          centerHipY: midHip.y,

        };
        onPoseSnapshotChange?.(snapshot);

        // decide main warning text (if any)
        let mainWarning: string | null = null;
        if (!stayedDownEnough) {
          mainWarning =
            "Move a bit slower and control the squat – don't just bounce.";
        } else if (depthTooShallow) {
          mainWarning =
            "Try to squat deeper so your knees bend more – don't stop halfway.";
        } else if (backTooLeaned) {
          mainWarning =
            "Keep your chest up and back straighter – don't bend forward too much.";
        } else if (kneesCavingIn) {
          mainWarning =
            "Push your knees slightly out so they stay roughly over your toes.";
        } else if (stanceTooNarrow) {
          mainWarning =
            "Take a slightly wider stance – feet about shoulder-width apart.";
        }

        if (anyFormError) {
          // ❌ bad rep: show warning & DO NOT count rep
          if (mainWarning) {
            showLocalWarning(mainWarning);
          } else {
            showLocalWarning("Form needs correction. Slow down and control the movement.");
          }
          // reps will remain locked until LLM finishes (handled in App)
        } else if (canCountRepsRef.current) {
          // ✅ good rep: count it
          repsRef.current += 1;
          onRepsChange(repsRef.current);

          if (repsRef.current % targetRepsPerSet === 0) {
            const completedSet = setNoRef.current;
            if (onSetComplete) {
              onSetComplete(completedSet, repsRef.current);
            }
            setNoRef.current += 1;
            onSetChange(setNoRef.current);
          }

          clearLocalWarning();
        }

        // reset state for next rep
        isDownRef.current = false;
        minKneeAngleRef.current = 180;
        downFramesRef.current = 0;
        backBadThisRepRef.current = false;
        kneesBadThisRepRef.current = false;
        stanceBadThisRepRef.current = false;

        return;
      }
    }

    // while in middle of movement but not finished rep yet, send live snapshot
    const liveSnapshot: PoseSnapshot = {
      exerciseId,
      phase: isDownRef.current ? "down" : "up",
      kneeAngle,
      backAngle,
      depthTooShallow: false,
      backTooLeaned: backBadThisRepRef.current,
      kneesCavingIn: kneesBadThisRepRef.current,
      stanceTooNarrow: stanceBadThisRepRef.current || stanceTooNarrowInstant,
      centerShoulderX: midShoulder.x,
      centerShoulderY: midShoulder.y,
      centerHipX: midHip.x,
      centerHipY: midHip.y,
    };
    onPoseSnapshotChange?.(liveSnapshot);
  };

    // ---------- JUMPING JACKS LOGIC ----------
  const updateJumpingJacksLogic = (landmarks: Landmark[]) => {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    if (
      !leftShoulder ||
      !rightShoulder ||
      !leftHip ||
      !rightHip ||
      !leftWrist ||
      !rightWrist ||
      !leftAnkle ||
      !rightAnkle
    ) {
      onPoseSnapshotChange?.(null);
      return;
    }

    // ---- basic geometric features ----
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    if (shoulderWidth === 0) {
      onPoseSnapshotChange?.(null);
      return;
    }

    const footWidth = Math.abs(leftAnkle.x - rightAnkle.x);
    const legSpreadRatio = footWidth / shoulderWidth;

    // arm height relative to shoulders (MediaPipe y: top = smaller)
    const leftArmHigh = leftWrist.y < leftShoulder.y - 0.05;
    const rightArmHigh = rightWrist.y < rightShoulder.y - 0.05;
    const leftArmLow = leftWrist.y > leftShoulder.y + 0.05;
    const rightArmLow = rightWrist.y > rightShoulder.y + 0.05;

    const bothArmsHigh = leftArmHigh && rightArmHigh;
    const bothArmsLow = leftArmLow && rightArmLow;

    const legsWide = legSpreadRatio > 1.3;
    const legsClosed = legSpreadRatio < 0.7;

    // simple "out of sync" instant flag
    const armsLegsOutOfSyncInstant =
      (bothArmsHigh && !legsWide) || (legsWide && !bothArmsHigh);

    // approximate arm raise angle (hip-shoulder-wrist average)
    const leftArmAngle = angleBetweenPoints(leftHip, leftShoulder, leftWrist);
    const rightArmAngle = angleBetweenPoints(rightHip, rightShoulder, rightWrist);
    const armRaiseAngle = (leftArmAngle + rightArmAngle) / 2;

    // thresholds
    const MIN_OPEN_FRAMES = 6;

    // determine current macro pose state
    const isOpenNow = bothArmsHigh && legsWide;
    const isClosedNow = bothArmsLow && legsClosed;

    // ---------- STATE MACHINE ----------
    if (!jjIsOpenRef.current) {
      // we are in "closed / neutral" region
      if (isOpenNow) {
        // transition: closed -> open (start of a jack)
        jjIsOpenRef.current = true;
        jjOpenFramesRef.current = 1;
        jjArmsEverHighRef.current = bothArmsHigh;
        jjLegsEverWideRef.current = legsWide;
        jjOutOfSyncRepRef.current = armsLegsOutOfSyncInstant;
      } else {
        // still idle/closed - send live snapshot
        const snapshot: PoseSnapshot = {
          exerciseId,
          phase: "closed",
          armRaiseAngle,
          legSpreadRatio,
          armsNotHighEnough: false,
          legsNotWideEnough: false,
          armsLegsOutOfSync: armsLegsOutOfSyncInstant,
        };
        onPoseSnapshotChange?.(snapshot);
        return;
      }
    } else {
      // currently in "open" region of a jack
      jjOpenFramesRef.current += 1;

      if (bothArmsHigh) jjArmsEverHighRef.current = true;
      if (legsWide) jjLegsEverWideRef.current = true;
      if (armsLegsOutOfSyncInstant) jjOutOfSyncRepRef.current = true;

      // if we returned to closed -> end of one jumping jack rep
      if (isClosedNow) {
        const tooFast = jjOpenFramesRef.current < MIN_OPEN_FRAMES;
        const armsNotHighEnough = !jjArmsEverHighRef.current;
        const legsNotWideEnough = !jjLegsEverWideRef.current;
        const armsLegsOutOfSync = jjOutOfSyncRepRef.current;

        const anyError =
          tooFast || armsNotHighEnough || legsNotWideEnough;

        const snapshot: PoseSnapshot = {
          exerciseId,
          phase: "closed",
          armRaiseAngle,
          legSpreadRatio,
          armsNotHighEnough,
          legsNotWideEnough,
          armsLegsOutOfSync,
        };
        onPoseSnapshotChange?.(snapshot);

        let mainWarning: string | null = null;
        if (tooFast) {
          mainWarning =
            "Slow your jumping jack a bit—open fully and close with control, not just quick flicks.";
        } else if (armsNotHighEnough) {
          mainWarning =
            "Raise your hands higher, close to overhead when you jump open.";
        } else if (legsNotWideEnough) {
          mainWarning =
            "Jump your feet a bit wider than shoulder-width to fully open the jack.";
        } 

        if (anyError) {
          if (mainWarning) {
            showLocalWarning(mainWarning);
          } else {
            showLocalWarning(
              "Your jack needs a bit of correction—open fully and move arms and legs together."
            );
          }
          // reps remain locked until LLM finishes (App handles lock)
        } else if (canCountRepsRef.current) {
          // ✅ good rep
          repsRef.current += 1;
          onRepsChange(repsRef.current);

          if (repsRef.current % targetRepsPerSet === 0) {
            const completedSet = setNoRef.current;
            if (onSetComplete) {
              onSetComplete(completedSet, repsRef.current);
            }
            setNoRef.current += 1;
            onSetChange(setNoRef.current);
          }

          clearLocalWarning();
        }

        // reset for next rep
        jjIsOpenRef.current = false;
        jjOpenFramesRef.current = 0;
        jjArmsEverHighRef.current = false;
        jjLegsEverWideRef.current = false;
        jjOutOfSyncRepRef.current = false;

        return;
      }
    }

    // live snapshot while in the middle of movement but not completed rep
    const liveSnapshot: PoseSnapshot = {
      exerciseId,
      phase: jjIsOpenRef.current ? "open" : "closed",
      armRaiseAngle,
      legSpreadRatio,
      armsNotHighEnough: !jjArmsEverHighRef.current,
      legsNotWideEnough: !jjLegsEverWideRef.current,
      armsLegsOutOfSync: jjOutOfSyncRepRef.current || armsLegsOutOfSyncInstant,
    };
    onPoseSnapshotChange?.(liveSnapshot);
  };



  // ---------- drawing ----------
  const drawSkeletonView = (landmarks: Landmark[]) => {
    const canvas = skeletonCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 3;
    ctx.strokeStyle = "#22d3ee";

    (POSE_CONNECTIONS as readonly [number, number][]).forEach(
      ([startIdx, endIdx]) => {
        const a = landmarks[startIdx];
        const b = landmarks[endIdx];
        if (!a || !b) return;
        const ax = a.x * w;
        const ay = a.y * h;
        const bx = b.x * w;
        const by = b.y * h;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    );

    ctx.fillStyle = "#facc15";
    landmarks.forEach((lm) => {
      const x = lm.x * w;
      const y = lm.y * h;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  };

  // ---------- mediapipe setup ----------
 useEffect(() => {
  if (!videoRef.current || !cameraCanvasRef.current) return;

  // Pose now comes from CDN script (global)
  const pose = getGlobalPoseInstance();
  pose.onResults((results: any) => {
    const canvas = cameraCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    const landmarks = results.poseLandmarks;
    if (landmarks) {
      // use global drawing helpers from CDN
      drawConnectors(ctx, landmarks, POSE_CONNECTIONS, {
        color: "aqua",
        lineWidth: 3,
      } as any);
      drawLandmarks(ctx, landmarks, {
        color: "yellow",
        radius: 3,
      } as any);

      if (exerciseId === "squats") {
        updateSquatLogic(landmarks);
      } else if (exerciseId === "jumping_jacks") {
        updateJumpingJacksLogic(landmarks);
      }

      drawSkeletonView(landmarks);
    } else {
      onPoseSnapshotChange?.(null);
    }

    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText(`Reps: ${repsRef.current}`, 20, 30);

    ctx.restore();
  });

  // Camera is also global from CDN
  const camera = new Camera(videoRef.current!, {
    onFrame: async () => {
      await pose.send({ image: videoRef.current! });
    },
    width: 640,
    height: 480,
  });

  camera.start();

  return () => {
    camera.stop();
  };
}, [exerciseId, targetRepsPerSet]);


  const formStatus = localWarning ? "Needs correction" : "Good 👍";
  const demoGif =
  exerciseId === "jumping_jacks" ? jumpingJacksGif : squatGif;
  const demoAlt =
  exerciseId === "jumping_jacks"
    ? "Correct Jumping Jack Pose"
    : "Correct Squat Pose";


  return (
    <div style={{ color: "white" }}>
      <h2 style={{ marginBottom: "10px" }}>{exerciseName} – Live Tracker</h2>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "20px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative" }}>
          <video
            ref={videoRef}
            style={{ display: "none" }}
            width={640}
            height={480}
          />
          <canvas
            ref={cameraCanvasRef}
            width={640}
            height={480}
            style={{
              border: "2px solid #00ffcc",
              borderRadius: "10px",
            }}
          />
        </div>
      </div>

      {showPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: "#111827",
              borderRadius: "16px",
              padding: "20px 24px",
              maxWidth: "420px",
              width: "90%",
              boxShadow: "0 10px 25px rgba(0,0,0,0.7)",
              border: "1px solid #f97373",
            }}
          >
            <h3 style={{ marginBottom: "10px", fontSize: "18px" }}>
              Pose wrong detected
            </h3>

            <div
              style={{
                marginBottom: "12px",
                height: "120px",
                borderRadius: "10px",
                background: "#020617",
                border: "1px dashed #4ade80",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                opacity: 0.8,
              }}
            >
              {/* TODO: replace with correct-pose image */}
              <img src={demoGif} alt={demoAlt} style={{ maxHeight: "100%", maxWidth: "100%" , objectFit: "contain"}} />
            </div>

            <p style={{ marginBottom: "16px", fontSize: "15px" }}>
              {popupText}
            </p>
            <button
              onClick={onUserSkipCorrection}
              style={{
                background: "#ef4444",
                color: "white",
                padding: "8px 16px",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
              }}
            >
              Skip coach & continue
            </button>

          </div>
        </div>
      )}
    </div>
  );
};

export default PoseDetector;
