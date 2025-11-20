from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import httpx
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for dev; later restrict to frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ollama config
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral:7b-instruct")


class CoachRequest(BaseModel):
    event_type: str
    user_name: str
    exercise: Optional[str] = None

    # session context
    reps: Optional[int] = None                  # total reps (exercise)
    warning: Optional[str] = None               # high-level rule-based message
    plan_summary: Optional[str] = None          # full workout description

    rep_in_set: Optional[int] = None
    set_index: Optional[int] = None
    total_sets_for_exercise: Optional[int] = None
    exercise_index: Optional[int] = None
    total_exercises: Optional[int] = None
    target_reps_per_set: Optional[int] = None

    # pose info from frontend (generic snapshot: booleans, angles, etc.)
    pose_snapshot: Optional[Dict[str, Any]] = None

    # extra numeric + joint info for POSE_ERROR
    angles: Optional[Dict[str, Any]] = None         # e.g. left_knee, right_knee, back_angle
    joints: Optional[Dict[str, Any]] = None           # e.g. shoulder: [x,y], hip: [x,y]
    realtime_state: Optional[Dict[str, Any]] = None   # e.g. rep_no, set_no, is_down_phase


class CoachResponse(BaseModel):
    text: str
    emotion: str
    animation: str


def build_prompt(req: CoachRequest,raw_body:Optional[Dict[str, Any]] = None) -> str:
    base = f"""
You are a friendly but slightly strict fitness trainer AI coaching {req.user_name} at home.

You see pose information from a vision model (MediaPipe style) as 'pose_snapshot'
with keys like kneeAngle, backAngle, depthTooShallow, backTooLeaned, kneesCavingIn, stanceTooNarrow, etc.

- Always reply in 1–2 short sentences.
- Be motivating but not cringe.
- Assume user is beginner–intermediate.
"""

    # -------- generic context --------
    if req.plan_summary:
        base += f"\nToday's full workout plan:\n{req.plan_summary}\n"

    if req.exercise_index is not None and req.total_exercises is not None:
        base += f"\nWe are on exercise {req.exercise_index} of {req.total_exercises}.\n"

    if req.exercise:
        base += f"Current exercise: {req.exercise}.\n"

    if req.set_index is not None and req.total_sets_for_exercise is not None:
        base += f"Current set: {req.set_index} of {req.total_sets_for_exercise}.\n"

    if req.rep_in_set is not None:
        base += f"Approximate rep number in this set: {req.rep_in_set}.\n"

    if req.rep_in_set is not None and req.target_reps_per_set is not None:
        remaining = max(req.target_reps_per_set - req.rep_in_set, 0)
        base += (
            f"Target reps per set: {req.target_reps_per_set}.\n"
            f"Remaining reps in this set (approx): {remaining}.\n"
        )

    if req.pose_snapshot:
        base += "\nLatest pose snapshot (boolean/angle flags):\n"
        for k, v in req.pose_snapshot.items():
            base += f"- {k}: {v}\n"

    # -------- event specific instructions ----------

    # 🔴 POSE_ERROR: use angles + joints + realtime_state + snapshot
    if req.event_type == "POSE_ERROR":
        base += "\nEvent: POSE_ERROR\n\n"
        base += "You are seeing a lower-body exercise pose (like a squat) with numeric metrics.\n"
        if req.exercise:
            base+=f"You are seeing the pose for the exercise:{req.exercise}.\n"
        else:
            base+="You are seeing an exercise pose with numeric metrics.\n"

        if req.warning:
            base += f"High-level detected issue from rule-based logic: {req.warning}\n"

        # Numeric angles
        if req.angles:
            base += "Numeric angles (in degrees):\n"
            base += f"- Left knee angle: {req.angles.get('left_knee')}\n"
            base += f"- Right knee angle: {req.angles.get('right_knee')}\n"
            base += f"- Back lean angle from vertical: {req.angles.get('back_angle')}\n"

        # Rep / set context
        if req.realtime_state:
            base += "Rep context:\n"
            base += f"- Rep number in set: {req.realtime_state.get('rep_no')}\n"
            base += f"- Set number: {req.realtime_state.get('set_no')}\n"
            base += f"- Is in down phase: {req.realtime_state.get('is_down_phase')}\n"

        # 🔽🔽🔽 CHANGED TASK BLOCK HERE 🔽🔽🔽
        base += """
Task:
Using the angles, flags, and context above, answer in 1 or 2 short conversational sentences.
Do NOT use bullet points, numbering, lists, or line breaks in your reply.
First briefly say what is wrong with the form (e.g., not deep enough, back too bent, knees caving in).
Then give one clear, practical cue to fix it using body parts
(e.g., "push your hips back and keep your chest up", "push your knees slightly out so they don't cave in").
Be specific, engaging, and motivating, but keep it concise.
"""

    elif req.event_type == "START_SESSION":
        base += """

Event: START_SESSION

Task:
Greet the user, briefly explain today's focus, and say you will guide each rep.
Mention the first exercise and encourage them to get into position.
"""

    elif req.event_type == "REP_PROGRESS":
        base += """

Event: REP_PROGRESS

Task:
Give one very short motivational coaching line about the current effort or form.
Use remaining reps information:
- If remaining <= 2, mention these are the last reps and encourage a strong finish.
- Otherwise, comment on pace, breathing, or posture in general.
Do NOT say an exact rep number like "rep 7". Speak in general terms.
One sentence only.
"""

    elif req.event_type == "SET_DONE":
        base += """

Event: SET_DONE

Task:
Congratulate the user for finishing the set in ONE short sentence and
tell them to either rest briefly or get ready for the next set.
"""

    elif req.event_type == "SESSION_DONE":
        base += """

Event: SESSION_DONE

Task:
Congratulate the user for completing today's workout, remind them to hydrate
and do light stretching, and close the session.
Keep it to 1–2 short sentences.
"""

    else:
        base += """

Event: GENERIC

Task:
Say one short, encouraging coaching line about maintaining good form and staying consistent.
"""

        if raw_body is not None:
            extra_keys =[
                k for k in raw_body.keys()
                if k not in {
                        "event_type", "user_name", "exercise", "reps", "warning",
                        "plan_summary", "rep_in_set", "set_index", "total_sets_for_exercise",
                        "exercise_index", "total_exercises", "target_reps_per_set",
                        "pose_snapshot", "angles", "joints", "realtime_state"
                }
            ]
            if extra_keys:
                base += "\nAdditional raw pose context from sensors/frontend:\n"
                for k in extra_keys:
                    base += f"- {k}: {raw_body[k]}\n"

    return base.strip()


@app.post("/coach/message", response_model=CoachResponse)
async def coach_message(req: CoachRequest, raw_req: Request):
    body= await raw_req.json()
    # print("Received /coach/message request:", body)
    prompt = build_prompt(req,body)

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
            },
        )
        data = resp.json()
        raw_text = data.get("response", "").strip()

    # simple emotion / animation mapping
    if req.event_type == "POSE_ERROR":
        emotion = "serious"
        animation = "explain_pose"
    elif req.event_type == "START_SESSION":
        emotion = "happy"
        animation = "intro"
    elif req.event_type == "SESSION_DONE":
        emotion = "happy"
        animation = "outro"
    else:
        emotion = "neutral"
        animation = "idle_talk"

    return CoachResponse(text=raw_text, emotion=emotion, animation=animation)
