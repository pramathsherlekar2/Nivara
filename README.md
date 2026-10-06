# NIVARA — AI-Powered Disaster Intelligence & Response

**Tagline:** See the danger. Understand the risk. Act faster.

Nivara is a hackathon prototype for PS2: AI Disaster Assistant. It combines incident reporting, multimodal evidence, explainable risk, location context, safe-zone guidance, Nivara Care, scenario simulation, offline-first storage, and a real **Gemma 4** analysis bridge.

## What's new in the AI build

- **Gemma 4 multimodal incident analysis** through a small Python/Flask backend.
- Optional incident photo + description + location + assistance mode are sent together to Gemma.
- Gemma returns structured risk, confidence, evidence, actions, escalation and human-verification guidance.
- The frontend has a safe offline fallback: if the backend/API key is unavailable, the report is still saved locally and clearly marked as pending AI analysis.
- The API key stays server-side in `.env` and is never placed in frontend JavaScript.

Google's official Gemma documentation lists Gemma 4 as an open-weight multimodal family; Gemma 4 image understanding supports image analysis, and the hosted Gemini API supports `gemma-4-26b-a4b-it` and `gemma-4-31b-it`. See the official docs before the demo for current availability and limits.

## Run Nivara with Gemma 4

**Final fixed build:** the evidence uploader supports both click-to-select and native drag-and-drop, and the saved incident keeps the returned Gemma assessment instead of overwriting it with the prototype fallback.

### 1. Install Python
Python 3.10+ is recommended.

### 2. Create the environment
Open a terminal inside the Nivara folder:

```powershell
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

### 3. Add your API key

Copy `.env.example` to `.env` and put your Google AI Studio API key in:

```text
GEMINI_API_KEY=YOUR_KEY_HERE
GEMMA_MODEL=gemma-4-26b-a4b-it
PORT=5000
```

**Never commit `.env` to GitHub.** It is already ignored by `.gitignore`.

### 4. Start Nivara

```powershell
python server.py
```

Open:

```text
http://127.0.0.1:5000
```

Or double-click `start_nivara.bat` on Windows.

### 5. Test the AI flow

1. Open **Report Incident**.
2. Choose a disaster type.
3. Enter a realistic description.
4. Upload a disaster image.
5. Add a location.
6. Click **Analyze & Save Incident**.
7. The Intelligence panel should change to **GEMMA 4 ANALYSIS READY**.

## Demo-safe wording

Nivara is **decision support**, not an authoritative emergency or engineering system. AI outputs can be wrong. Human responders should verify critical information before acting.

## GitHub hygiene

Commit the project in meaningful stages, for example:

1. `feat: build Nivara disaster command center`
2. `feat: add multimodal incident reporting and care modes`
3. `feat: add city-aware operation map and safe zones`
4. `feat: integrate Gemma 4 incident intelligence`
5. `docs: add setup and hackathon documentation`

Do not commit `.env`, API keys, credentials, or private user data.
