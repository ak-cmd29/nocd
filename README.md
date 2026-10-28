# NOCD Intake AI Knowledge Check

An internal enablement prototype for NOCD Intake Operations. Managers publish a structured knowledge check (topic, reference material, three questions with grading criteria). Intake advocates answer each question **out loud**; the system transcribes the audio, grades the answers for conceptual accuracy and clinical-boundary adherence, and shows the advocate their transcript next to the AI's coaching.

The bundled sample check tests three high-stakes intake competencies: explaining how ERP differs from talk therapy, navigating the $240 cash-pay and superbill process, and **refusing to reassure** a member about intrusive thoughts while explaining Session 1.

See [`DESIGN.md`](./DESIGN.md) for the product brief, scoring logic, architecture, trade-offs, and roadmap.

---

## Tech stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) | Server Components keep secrets and grading criteria on the server; Route Handlers host the AI pipeline. |
| Styling | Tailwind CSS v4, `lucide-react` icons | Fast, consistent internal UI with no extra component library. |
| Auth, database, files | Supabase (Auth, Postgres with Row-Level Security, Storage) | One service for login, role-based data access, and audio storage. RLS enforces "agents only see their own attempts" at the database layer. |
| Audio capture | Browser `MediaRecorder` (`audio/webm` Opus, falling back to `audio/mp4` AAC) | No plugins; WebM in Chrome, Edge, and Firefox, MP4 in Safari. |
| Speech-to-text | Groq `whisper-large-v3` | High-accuracy Whisper at very low latency, so three answers transcribe in seconds. |
| Evaluation | Anthropic Claude (`claude-sonnet-5-5` by default, configurable) with JSON-schema structured output | Strong at nuanced rubric grading; structured output guarantees parseable results. Claude 3.5 Sonnet, named in the original spec, has been retired by Anthropic. |
| Observability | Structured JSON logs + Langfuse | Every log line carries the `attemptId`; each attempt is one Langfuse trace with token usage and latency. |

---

## Setup

### Prerequisites

- Node.js 22.18 or newer (the seed script runs TypeScript directly with Node's built-in type stripping).
- A Supabase project, a Groq API key, an Anthropic API key, and (optionally) a Langfuse project.
- A current version of Chrome, Edge, Firefox, or Safari for recording.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key, used by the browser and by RLS-scoped server calls. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only. Used by the seed script and to save transcripts and evaluations. Never expose to the browser. |
| `GROQ_API_KEY` | Yes | Whisper transcription. |
| `ANTHROPIC_API_KEY` | Yes | Claude evaluation. |
| `ANTHROPIC_MODEL` | No | Overrides the evaluation model. Defaults to `claude-sonnet-5-5`. |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | No | Enables Langfuse tracing. If either is missing, tracing is skipped and everything else still works. |
| `LANGFUSE_BASEURL` | No | Langfuse host. Defaults to `https://cloud.langfuse.com`. `LANGFUSE_BASE_URL` is also accepted. |

### 3. Create the database schema

Open the Supabase dashboard, go to **SQL Editor**, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. The script is idempotent, so it is safe to re-run after pulling changes. It creates:

- `profiles`, `knowledge_checks`, and `attempts` tables, with a trigger that creates a profile on sign-up. The role comes from the user's `app_metadata`, which only the service role can set, and defaults to `agent`.
- Row-Level Security policies and table privileges, including the 3-attempt limit per agent per check.
- The public `recordings` storage bucket and its upload policy.

Also turn off public sign-ups (**Authentication → Sign In / Providers → Allow new users to sign up**). Reviewer accounts are created by the seed script, so nothing else needs sign-up.

### 4. Seed reviewer accounts and the sample check

```bash
npm run seed
```

This creates (or resets) the two reviewer accounts below with confirmed emails, and publishes `sample_check.json` once under the manager account. It is safe to run repeatedly. `npm run db:seed` resets only the accounts, without publishing the check.

Each agent gets **3 attempts per knowledge check**. Failed attempts, and attempts abandoned for more than 10 minutes, don't count. To give the test agent a clean slate:

```bash
npm run db:reset-attempts                      # agent@nocd.com
npm run db:reset-attempts -- someone@nocd.com  # any other agent
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `localhost` counts as a secure origin, so the browser will allow microphone access.

---

## Reviewer test credentials

| Role | Email | Password |
| --- | --- | --- |
| Manager | `manager@nocd.com` | `password123` |
| Agent (intake advocate) | `agent@nocd.com` | `password123` |

---

## Knowledge check file format

Managers upload a single **`.json` file** (max 1 MB) containing one object. The same validator runs in the browser before upload and again in `POST /api/checks`, and every problem is listed field by field.

| Field | Type | Rules |
| --- | --- | --- |
| `topic` | string | Required, up to 200 characters. |
| `reference_material` | string | Required, up to 50,000 characters. The source of truth Claude grades against. |
| `questions` | array | Required, **exactly 3** items. |
| `questions[].id` | string | Optional; letters, numbers, `-`, `_`. Defaults to `q1`–`q3`. Must be unique. |
| `questions[].prompt` | string | Required, up to 2,000 characters. The scenario the agent answers aloud. |
| `questions[].criteria` | string | Required, up to 8,000 characters. The rubric: required concepts, critical failures, and the pass / needs_review / fail rule. |
| `questions[].sample_good_response` | string | Optional, up to 8,000 characters. Calibrates the grader; never shown to agents. |

```json
{
  "topic": "NOCD Member Intake: ERP Differentiation, Cash-Pay Navigation, & Session 1 Boundaries",
  "reference_material": "SECTION 1: WHAT ERP IS AND WHY IT IS DIFFERENT\n...",
  "questions": [
    {
      "id": "q1",
      "prompt": "A prospective member says: 'I've already done years of talk therapy and it didn't help...'",
      "criteria": "REQUIRED CONCEPTS: (1) ... CRITICAL FAILURES: ... SCORING: pass = ...; needs_review = ...; fail = ...",
      "sample_good_response": "That's a really common experience..."
    },
    { "id": "q2", "prompt": "...", "criteria": "..." },
    { "id": "q3", "prompt": "...", "criteria": "..." }
  ]
}
```

The full example is [`sample_check.json`](./sample_check.json). Question 3 is always treated as the clinical-boundary (reassurance) test.

---

## Walkthrough

### As a manager: publish a check

1. Sign in as `manager@nocd.com`. You land on the **Manager Dashboard** (`/manager`).
2. Either drag `sample_check.json` onto the upload area, or click **Load Sample Check**.
3. Review the preview: topic, reference material, and all three questions with their grading criteria and sample answers. Invalid files show field-by-field errors instead.
4. Click **Publish check**. It appears in **Published checks**; click **Preview** to see the saved version.
5. To take a check down, click **Remove** in its row and confirm. This permanently deletes the check along with every agent attempt and recording for it.

`npm run seed` already published one copy of the sample check, so publishing again creates a second copy. That is expected.

### As an agent: record three answers

1. Sign out, then sign in as `agent@nocd.com`. You land on **Knowledge checks** (`/agent`).
2. Click **Start assessment** on the sample check. Each check shows how many of your 3 attempts remain.
3. For each question: click **Record answer**, allow microphone access the first time, speak your answer (2 seconds to 3 minutes), then click **Stop**. Use the player to listen back, and **Re-record** if you want another take. Click **Next** to continue.
4. After all three are recorded, click **Submit Assessment** on Question 3. Progress moves through uploading, **Transcribing audio...**, and **Claude evaluating answers...**, then opens your results. This typically takes 15 to 45 seconds.

Tip for testing the reassurance check: on Question 3, try once with a compliant answer ("I'm not a clinician, but your therapist is trained to help with exactly this...") and once with a reassuring one ("You'd never do that, you're not a bad person"). The second should fail with a clinical-boundary warning.

### Review results

The results page (`/agent/results/<attemptId>`) shows:

- The overall result (any fail means fail; otherwise any needs-review means needs review), how many questions passed, and the submission date.
- For each question: the prompt, the grading criteria, a player for the original recording, the **full transcript** of what the system heard, and Claude's evaluation (score badge, key concepts found, missing or incorrect elements, and coaching advice).

Results are read from Supabase on every load, so refreshing or returning later shows the same saved evaluation. Past attempts are listed under **Your attempts** on `/agent`. Managers can open any attempt's results URL.

---

## Observability

### Server logs

Every step of the pipeline writes one JSON line to the terminal running `npm run dev` (or your host's log stream in production). Each line includes `timestamp`, `level`, `step`, `attemptId`, and `message`:

| Step | Meaning |
| --- | --- |
| `[API]` | Request accepted, overall pipeline result, and total latency. |
| `[STT]` | Per-question transcription start, latency, and transcript length (never the transcript text). |
| `[EVAL]` | Claude call start, latency, per-question scores, and reassurance-violation count. |
| `[DB]` | Loading the check, saving transcripts, saving the evaluation, and marking failures. |

Example:

```json
{"timestamp":"2026-10-28T02:14:07.512Z","level":"info","step":"[STT]","attemptId":"3f0c2b4e-...","message":"Transcribed question 2","question":2,"latencyMs":1380,"characters":612}
```

Errors are logged at `level: "error"` with the error name, message, HTTP status (for Groq or Anthropic failures), stack, and underlying cause. To follow one submission:

```bash
npm run dev 2>&1 | grep '"attemptId":"<attempt-id>"'
```

If a step fails, the attempt is marked `failed` in the database, the agent sees which step failed with a **Try again** option, and plain JSON callers receive an HTTP 500 that names the failed step and attempt id.

### Langfuse traces

Tracing uses the Langfuse v6 SDK on OpenTelemetry (`src/instrumentation.ts`). Restart `npm run dev` after adding the keys so the tracer registers.

1. Open your Langfuse project at [https://cloud.langfuse.com](https://cloud.langfuse.com) (or your self-hosted `LANGFUSE_BASEURL`).
2. Go to **Tracing → Traces**.
3. Find the trace named `knowledge-check-evaluation`. Every attempt's trace ID is derived from its attempt ID, so you can find it by filtering on metadata `attempt_id` = the ID from a results URL. You can also filter by **User ID** (the agent's ID) or **Session ID** (the check's ID, which groups all attempts on one check).

Each trace contains:

- `stt-q1`, `stt-q2`, `stt-q3`: spans with Whisper latency and transcript length.
- `claude-grade-answers`: the Claude generation with the full prompt, structured output, input/output/total tokens, latency, and stop reason. Langfuse computes **cost** from the model name and token usage. If your Langfuse project has no price for the configured `ANTHROPIC_MODEL`, add it under **Settings → Models**.
- Trace metadata on every span: `attempt_id`, `check_id`, `agent_id`, plus `model`, `latency_ms`, and `total_tokens` on the trace.
- Failed steps are marked with level `ERROR` and the error message.

### Reproducing failures

Each scenario below shows the expected behavior and where to look.

| Scenario | How to reproduce | Expected result |
| --- | --- | --- |
| Malformed upload | As the manager, upload a `.json` file with only two questions, a missing `criteria`, or broken JSON. | Field-by-field errors in the UI; nothing is saved. `POST /api/checks` returns 422 with the same `details`. |
| Agent tries to publish | Signed in as the agent, run `fetch("/api/checks", { method: "POST", body: "{}" }).then(r => r.status)` in the browser console. | `403`. |
| Agent opens someone else's results | Signed in as the agent, open `/agent/results/<another agent's attempt id>`. | 404 page (RLS returns no row). |
| Tampered audio URLs | As the agent, `POST /api/evaluate` with `audioUrls` pointing anywhere other than the attempt's own storage paths. | `422 Audio URLs do not match this attempt's recordings.` and a `[API]` warn log. |
| Silent or empty answer | Record about 3 seconds of silence for one question and submit. | The pipeline completes; that question fails with "re-record a complete answer" feedback, and the transcript panel shows what Whisper heard. |
| Speech-to-text outage | Set `GROQ_API_KEY=invalid` in `.env.local`, restart, and submit. | Attempt marked `failed`; the agent sees "Transcription failed for question N: Groq rejected the API key." Logs show `[STT]` errors with `status: 401`; the Langfuse trace shows `stt-q*` spans at level `ERROR`. Failed attempts don't use up one of the 3 tries. |
| Evaluation outage | Set `ANTHROPIC_MODEL=claude-does-not-exist`, restart, and submit. | Attempt marked `failed`; `[EVAL]` error log with `status: 404`; the `claude-grade-answers` generation is at level `ERROR`. |
| Attempt limit | Submit 3 completed attempts on one check. | **Start assessment** becomes "No attempts left"; the server action and the database insert policy both refuse a 4th. Reset with `npm run db:reset-attempts`. |

To pull every log line for a failed attempt, copy the attempt ID from the results URL and run the `grep` command above.

<!-- Replace with a real screenshot after your first traced submission. -->
> **Screenshot placeholder:** add `docs/images/langfuse-trace.png` showing a `knowledge-check-evaluation` trace, then embed it here with `![Langfuse trace for one attempt](docs/images/langfuse-trace.png)`.

---

## Project structure

```
src/
  app/
    login/                    Sign-in page and server actions
    manager/                  Dashboard (upload, preview, published checks) and check preview
    agent/                    Check list, recording wizard (record/[id]), results (results/[id])
    api/checks/route.ts       POST: publish a knowledge check (managers only)
    api/evaluate/route.ts     POST: transcribe, evaluate, and save an attempt
  components/                 UI for the manager and agent surfaces
  hooks/use-audio-recorder.ts MediaRecorder wrapper (WebM or MP4, limits, mic errors)
  lib/
    groq.ts                   Whisper transcription
    anthropic.ts              Claude grading prompt, structured output, Langfuse tracing
    langfuse.ts, logger.ts    Observability
    supabase/                 Browser, server (cookie session), and service-role clients
    validation/               Knowledge check schema validation (shared by browser and API)
  proxy.ts                    Session refresh and signed-out redirects
supabase/schema.sql           Tables, RLS, trigger, storage bucket and policies
scripts/seed.mts              Reviewer accounts and sample check
scripts/reset-attempts.mts    Clears one agent's attempts and recordings
sample_check.json             The sample high-stakes intake knowledge check
```

---

## Known limitations

- **Recordings are in a public bucket.** Paths contain an unguessable attempt UUID, but anyone with a recording URL can play it. Production should use a private bucket with short-lived signed URLs.
- **Grading criteria are shown after submission.** Agents never see criteria before answering (RLS restricts `knowledge_checks` to managers), but the results page shows each question's criteria, which helps on a retake.
- **Abandoned submissions aren't swept.** If an agent closes the tab mid-upload, the row stays `processing` in the database. The app shows it as failed after 10 minutes and it doesn't count toward the attempt limit, but nothing rewrites the row.
- **Evaluation runs inside the request** (up to 120 seconds). A background job queue would be more resilient at scale.
