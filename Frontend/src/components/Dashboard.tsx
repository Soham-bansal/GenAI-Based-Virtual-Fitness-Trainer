// src/components/Dashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { loadDailyActivity } from "../storage";
import type { DailyActivityMap } from "../types";

interface DayCell {
  date: string;
  completed: boolean;
  reps: number;
}

const DAYS_IN_YEAR = 365;

function buildLastYearCells(activity: DailyActivityMap): DayCell[] {
  const today = new Date();
  const cells: DayCell[] = [];

  for (let i = 0; i < DAYS_IN_YEAR; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (DAYS_IN_YEAR - 1 - i));

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;

    const entry = activity[key];
    const reps = entry?.totalReps ?? 0;
    const completed = reps > 0;

    cells.push({ date: key, completed, reps });
  }

  return cells;
}

function computeStreaks(cells: DayCell[]) {
  let currentStreak = 0;
  let maxStreak = 0;
  let totalActiveDays = 0;

  // max streak + total active days
  let running = 0;
  for (const c of cells) {
    if (c.completed) {
      totalActiveDays += 1;
      running += 1;
      if (running > maxStreak) maxStreak = running;
    } else {
      running = 0;
    }
  }

  // current streak from today backwards
  for (let i = cells.length - 1; i >= 0; i--) {
    if (!cells[i].completed) break;
    currentStreak += 1;
  }

  return { currentStreak, maxStreak, totalActiveDays };
}

const Dashboard: React.FC = () => {
  const [activity, setActivity] = useState<DailyActivityMap>({});

  useEffect(() => {
    setActivity(loadDailyActivity());
  }, []);

  const cells = useMemo(() => buildLastYearCells(activity), [activity]);
  const { currentStreak, maxStreak, totalActiveDays } = useMemo(
    () => computeStreaks(cells),
    [cells]
  );

  const totalReps = Object.values(activity).reduce(
    (sum, d) => sum + d.totalReps,
    0
  );
  const totalSessions = Object.values(activity).reduce(
    (sum, d) => sum + d.sessions,
    0
  );

  const achievements = [
    {
      id: "first-day",
      label: "First Session",
      unlocked: totalActiveDays >= 1,
    },
    {
      id: "streak-7",
      label: "7-Day Streak",
      unlocked: maxStreak >= 7,
    },
    {
      id: "streak-30",
      label: "30-Day Streak",
      unlocked: maxStreak >= 30,
    },
    {
      id: "streak-50",
      label: "50-Day Badge",
      unlocked: maxStreak >= 50,
    },
  ];

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "none",
        margin: "0",
        padding: "0 4px",
      }}
    >
      {/* Top stats row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            flex: "1 1 240px",
            background: "#020617",
            borderRadius: "14px",
            padding: "12px 14px",
            border: "1px solid #1f2937",
          }}
        >
          <div style={{ fontSize: "13px", opacity: 0.8 }}>Total reps</div>
          <div style={{ fontSize: "22px", fontWeight: 600 }}>{totalReps}</div>
        </div>

        <div
          style={{
            flex: "1 1 240px",
            background: "#020617",
            borderRadius: "14px",
            padding: "12px 14px",
            border: "1px solid #1f2937",
          }}
        >
          <div style={{ fontSize: "13px", opacity: 0.8 }}>Total sessions</div>
          <div style={{ fontSize: "22px", fontWeight: 600 }}>
            {totalSessions}
          </div>
        </div>

        <div
          style={{
            flex: "1 1 240px",
            background: "#020617",
            borderRadius: "14px",
            padding: "12px 14px",
            border: "1px solid #1f2937",
          }}
        >
          <div style={{ fontSize: "13px", opacity: 0.8 }}>Current streak</div>
          <div style={{ fontSize: "22px", fontWeight: 600 }}>
            {currentStreak} days
          </div>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            Max streak: {maxStreak} days
          </div>
        </div>

        <div
          style={{
            flex: "1 1 240px",
            background: "#020617",
            borderRadius: "14px",
            padding: "12px 14px",
            border: "1px solid #1f2937",
          }}
        >
          <div style={{ fontSize: "13px", opacity: 0.8 }}>Active days</div>
          <div style={{ fontSize: "22px", fontWeight: 600 }}>
            {totalActiveDays}
          </div>
        </div>
      </div>

      {/* Heatmap grid */}
      <div
        style={{
          background: "#020617",
          borderRadius: "14px",
          padding: "14px 16px",
          border: "1px solid #1f2937",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            marginBottom: "8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "13px",
          }}
        >
          <span>Workout activity (last 12 months)</span>
          <span style={{ opacity: 0.7, fontSize: "12px" }}>
            Darker green = more reps
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(53, 10px)",
            gridAutoRows: "10px",
            gap: "3px",
          }}
        >
          {cells.map((cell, idx) => {
            const level = !cell.completed
              ? 0
              : cell.reps >= 150
              ? 3
              : cell.reps >= 75
              ? 2
              : 1;

            const bg =
              level === 0
                ? "#111827"
                : level === 1
                ? "#16a34a"
                : level === 2
                ? "#22c55e"
                : "#4ade80";

            return (
              <div
                key={cell.date + "-" + idx}
                title={`${cell.date} • reps: ${cell.reps}`}
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "2px",
                  backgroundColor: bg,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Achievements */}
      <div
        style={{
          background: "#020617",
          borderRadius: "14px",
          padding: "14px 16px",
          border: "1px solid #1f2937",
        }}
      >
        <div style={{ marginBottom: "8px", fontSize: "13px" }}>
          Achievements
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {achievements.map((a) => (
            <div
              key={a.id}
              style={{
                padding: "8px 10px",
                borderRadius: "999px",
                fontSize: "12px",
                border: a.unlocked ? "1px solid #22c55e" : "1px dashed #4b5563",
                background: a.unlocked ? "#052e16" : "#020617",
                opacity: a.unlocked ? 1 : 0.6,
              }}
            >
              {a.unlocked ? "🏅 " : "🔒 "}
              {a.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
