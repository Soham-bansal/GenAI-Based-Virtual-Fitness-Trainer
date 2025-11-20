# 🏋️‍♂️ GenAI Virtual Fitness Trainer  
A real-time, intelligent workout assistant powered by **AI coaching**, **vision-based pose detection**, **rep counting**, **form correction**, and a **LeetCode-style fitness dashboard**.

---

## 🚀 Overview  
GenAI Virtual Trainer is a full-stack AI fitness app that helps users work out at home with **live pose tracking** and **conversational coaching** powered by a **local LLM**.

It uses:

- **MediaPipe Pose** → Real-time skeleton tracking  
- **Custom pose logic** → Rep counting + form error detection  
- **Ollama + Mistral** → Local AI trainer  
- **SpeechSynthesis** → Voice feedback  
- **Lip-Synced Avatar** → Realistic speaking animation  
- **Streaks + Achievements Dashboard** → Like GitHub + LeetCode  
- **Session Resume System** → Continue later on the same day  

---

## ✨ Features  

### 🔹 Real-Time Pose Tracking  
- Live skeleton drawing  
- Squats + Jumping Jacks  
- Accurate rep counting  
- Down-phase & up-phase detection  
- Out-of-sync detection for jumping jacks  

---

### 🔹 Smart Form Correction  
Automatically detects:  

- Not deep enough squats  
- Fast bouncing  
- Back bending forward  
- Narrow stance  
- Knees caving in  
- Jumping jack arms not lifting enough  
- Legs not wide enough  
- Arms & legs out of sync  

Each error triggers a **popup with exercise-specific GIF**.

---

### 🔹 AI Personal Coach (LLM-based)  
Your AI trainer:

- Greets you  
- Talks during reps  
- Gives form corrections  
- Encourages last reps  
- Wraps up the session  
- Speaks with lip-sync animation  

Uses **Ollama + `mistral:7b-instruct`** (configurable).

---

### 🔹 LeetCode-Style Dashboard  
Tracks:

- Total reps  
- Total sessions  
- Active days  
- Streaks  
- GitHub-like activity heatmap  
- Achievement badges  

---

### 🔹 Smart Session System  
- Daily auto-save using localStorage  
- Return anytime → continues same workout  
- “Stop session for now” pauses the workout  
- “Hard Reset” backdoor resets everything  

---

## 📸 Screenshots  

> Replace the image paths with the actual ones in your repo (`/assets/...` or `/docs/...`).

![Workout Screenshot](assets/workout.png)

![Form Error Popup](assets/warning.png)

![Dashboard](assets/dashboard.png)

---

## 🛠️ Tech Stack  

### **Frontend**
- React + TypeScript  
- MediaPipe Pose (CDN)  
- Custom pose algorithms (Squats, Jumping Jacks)  
- Browser **SpeechSynthesis**  
- LipSync viseme-based mouth animation  
- localStorage for session persistence  

### **Backend**
- FastAPI  
- Pydantic v2  
- httpx  
- Ollama (Local LLM runner)  
- Mistral / other compatible LLMs  

---

## 📂 Folder Structure  

```bash
GenAI-Based-Virtual-Fitness-Trainer/
│
├── backend/
│   ├── main.py
│   
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── PoseDetector.tsx
│   │   │   ├── TrainerAvatar.tsx
│   │   │   └── Dashboard.tsx
│   │   ├── App.tsx
│   │   └── storage.ts
│   ├── public/
│   │   └── mediapipe/       # (optional if you ever host MP locally)
│   └── package.json
│
└── README.md
