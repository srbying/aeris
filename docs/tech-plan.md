**AERIS**

Technical Plan - MVP

_Hosting · Database · OpenAI Chat · Release Strategy_

| **Field** | **Value**          |
| --------- | ------------------ |
| Version   | 1.0 - MVP          |
| Author    | Steven             |
| Date      | May 2026           |
| Status    | Draft              |
| Based On  | Aeris MVP PRD v1.0 |

# **1\. Architecture Decisions & Rationale**

This section documents the key infrastructure decisions made during planning, including the tradeoffs considered and the rationale for each choice.

## **1.1 Hosting - Vercel (Free Tier)**

Decision: Deploy on Vercel free tier using the Edge Runtime for the chat API route.

Vercel is the natural fit given existing experience with the platform, and the Next.js App Router is first-class on Vercel. The one constraint on the free tier is a 10-second serverless function timeout - which is tight for a chat endpoint that must fetch activity data from Supabase and stream an OpenAI response.

The solution is to deploy /api/chat as a Vercel Edge Function rather than a standard Node.js serverless function. Edge Functions run on Vercel's CDN infrastructure and are not subject to the 10-second limit - they are purpose-built for streaming responses. This is the correct pattern for Server-Sent Events (SSE) streaming regardless of cost tier.

| **Consideration** | **Detail**                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Function timeout  | Edge Runtime: no hard timeout on streaming. Node.js serverless: 10s limit on free tier.   |
| Streaming support | Edge Runtime has native ReadableStream / SSE support - ideal for OpenAI Responses API streaming. |
| Cold starts       | Edge Functions have near-zero cold start time vs. ~500ms for Node.js serverless.          |
| Constraints       | Edge Runtime cannot use native Node.js modules. All dependencies must be edge-compatible. |
| Cost              | Free tier covers personal usage volume comfortably.                                       |
| Upgrade path      | Vercel Pro (\$20/mo) unlocks 5-min Node.js timeouts if needed post-MVP.                   |

_Action: Set export const runtime = 'edge' on the /api/chat route. All other routes (upload, activities) can remain as standard Node.js serverless functions._

## **1.2 Database - Supabase (Postgres)**

Decision: Supabase Postgres as specified in the PRD. No vector database needed for MVP.

A vector database (Pinecone, Weaviate, pgvector) is designed for semantic similarity search - finding records that are conceptually similar to a query based on embedding vectors. Aeris's chat strategy is not semantic search. It is structured data injection: pull activity rows from Postgres, serialize to JSON, inject into the model prompt as context.

This is the right approach for Aeris because the data is already highly structured and numerical. Questions like 'am I getting faster?' are answered better by aggregating avg_pace and avg_hr over date ranges than by embedding-similarity search over run records. A vector DB would add complexity with no benefit for MVP.

| **Option**          | **Use Case Fit**                                                          | **Decision**                                |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| Supabase Postgres   | Structured activity data, date range queries, aggregations, deduplication | ✅ Use for MVP                              |
| Pinecone / pgvector | Semantic search over unstructured text (e.g., run notes, descriptions)    | ❌ Not needed - no unstructured text in MVP |
| Redis               | Session caching, rate limiting                                            | ❌ Overkill for single-user personal tool   |

_Future consideration: If run notes/journal entries are added post-MVP, pgvector (built into Supabase) can be enabled without migrating databases. This keeps the vector DB door open at zero cost._

Supabase free tier limits: 500MB database storage, 2GB bandwidth/month, 50,000 monthly active users. All are well within range for a single-user personal tool with hundreds of activity rows.

## **1.3 AI Chat - OpenAI API with LLM Router Pattern**

Decision: OpenAI GPT-5.5 via the Responses API as the default model, wrapped in a lightweight LLM router abstraction that allows swapping providers without changing application code.

**Cost Reality Check**

At ~150 running activities (12 months of history), each serialized to approximately 50 tokens, the per-session context payload is ~7,500 tokens. This is small for a single-user personal tool. Input cost, cached-input cost, and output cost should be calculated from the current OpenAI pricing page before launch because model pricing and service tiers can change.

| **Usage Pattern**      | **Estimated Input Tokens/Session** | **Cost Note**                                      |
| ---------------------- | ---------------------------------- | -------------------------------------------------- |
| Light (5 questions)    | ~37,500                            | Recalculate from current OpenAI pricing            |
| Regular (10 questions) | ~75,000                            | Recalculate from current OpenAI pricing            |
| Heavy (20 questions)   | ~150,000                           | Output length and reasoning effort drive variance  |

This is low enough that the OpenAI API is the clear choice for quality and simplicity at launch. Open-source alternatives (Llama 3, Mistral, Qwen) require either local GPU resources or paid managed GPU hosting (Replicate, Modal, HuggingFace Inference Endpoints), which adds operational complexity that outweighs the cost savings at this usage volume.

**LLM Router Architecture**

Rather than calling the OpenAI Responses API directly in /api/chat, wrap the model call behind a thin provider interface. This costs ~30 minutes of setup and gives you a clean swap point for any future model or provider change.

| **File**          | **Purpose**                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- |
| lib/llm/types.ts  | LLMProvider interface: { complete(messages, options): AsyncIterable&lt;string&gt; } |
| lib/llm/openai.ts | OpenAI SDK implementation using the Responses API                                    |
| lib/llm/ollama.ts | Ollama local model implementation (for dev/experimentation)                         |
| lib/llm/index.ts  | Factory: reads LLM_PROVIDER env var, returns the right provider                     |
| .env.local        | LLM_PROVIDER=openai \| LLM_MODEL=gpt-5.5                                            |

_To swap to Ollama locally: set LLM_PROVIDER=ollama in .env.local. To swap to Claude, Gemini, or another provider post-MVP: add a new provider implementation file and update LLM_PROVIDER. The chat route never needs to change._

## **1.4 Data Scope - Last 12 Months for MVP**

Decision: MVP loads only the last 12 months of activity data as chat context. Full historical depth is a post-MVP investment.

This directly addresses the context size problem. At 5 runs/week for 12 months, the dataset is ~250 rows maximum - well within a single prompt and predictably cheap. The PRD's Section 8 token optimization strategies (query-aware filtering, precomputed aggregates) remain valid post-MVP investments as history accumulates.

The full activity history is still stored in Supabase - only the context window sent to the LLM is scoped to 12 months. The dashboard charts can be extended to use the full dataset at any time without architectural changes.

# **2\. Full Stack Summary**

| **Layer**     | **Technology**                   | **Tier / Cost** | **Notes**                                         |
| ------------- | -------------------------------- | --------------- | ------------------------------------------------- |
| Framework     | Next.js 14 (App Router)          | Free            | As specified in PRD                               |
| Hosting       | Vercel                           | Free tier       | Edge Runtime for /api/chat                        |
| Database      | Supabase Postgres                | Free tier       | 500MB storage, plenty for activity rows           |
| AI - Default  | OpenAI GPT-5.5 (Responses API)   | Usage-based     | Via LLM router abstraction                        |
| AI - Dev/Swap | Ollama (local)                   | Free            | Via same router interface                         |
| Charts        | Recharts                         | Free / MIT      | As specified in PRD                               |
| Styling       | Tailwind CSS                     | Free            | As specified in PRD                               |
| CSV Parsing   | PapaParse                        | Free / MIT      | Client-side, as specified in PRD                  |
| Vector DB     | None (MVP)                       | -               | pgvector available in Supabase if needed post-MVP |

# **3\. Data Architecture**

## **3.1 Activity Table**

As defined in the PRD, with one addition: a scope column is not needed - date filtering handles the 12-month context window at query time.

| **Column**          | **Type**         | **Notes**                              |
| ------------------- | ---------------- | -------------------------------------- |
| id                  | uuid PRIMARY KEY | Default gen_random_uuid()              |
| activity_date       | timestamptz      | Parsed from Garmin CSV Date field      |
| activity_type       | text             | Filtered to 'Running' for chat context |
| distance_km         | numeric          |                                        |
| duration_seconds    | integer          |                                        |
| avg_pace_sec_per_km | integer          |                                        |
| avg_hr              | integer          |                                        |
| max_hr              | integer          |                                        |
| calories            | integer          |                                        |
| ascent_m            | integer          |                                        |
| vo2max_estimate     | numeric          | Garmin-reported if present in CSV      |
| raw_csv_row         | jsonb            | Full original row for future use       |
| created_at          | timestamptz      | Default now()                          |

Unique index: (activity_date, activity_type, distance_km) - drives deduplication on re-upload.

## **3.2 Context Window Strategy**

On each chat request, the /api/chat route fetches running activities from the last 12 months and serializes them as a compact JSON array injected into the OpenAI prompt context:

| **Field**     | **Verbose Key**     | **Compact Key** | **Token Saving** |
| ------------- | ------------------- | --------------- | ---------------- |
| Date          | activity_date       | d               | ~70%             |
| Pace (sec/km) | avg_pace_sec_per_km | pace            | ~60%             |
| Heart Rate    | avg_hr              | hr              | ~50%             |
| Distance      | distance_km         | dist            | ~50%             |
| VO2 Max       | vo2max_estimate     | vo2             | ~60%             |

_Compressed row format (Section 8 of PRD): { d, pace, hr, dist, vo2 } across 250 rows ≈ 3,500-5,000 tokens. Well within GPT-5.5's context window and economical for personal usage._

# **4\. API Route Design**

| **Route**       | **Method** | **Runtime**        | **Purpose**                                |
| --------------- | ---------- | ------------------ | ------------------------------------------ |
| /api/upload     | POST       | Node.js serverless | CSV ingestion, dedup, Supabase upsert      |
| /api/activities | GET        | Node.js serverless | Fetch all activities as JSON for dashboard |
| /api/chat       | POST       | Edge Runtime ⚡    | LLM router call, SSE streaming response    |

The Edge Runtime designation on /api/chat is the critical architectural decision that eliminates the Vercel free tier timeout constraint. All streaming happens within the edge function; the client receives an SSE stream and renders tokens as they arrive.

_Add export const dynamic = 'force-dynamic' to /api/activities and /api/upload to prevent Vercel from caching responses, as specified in the PRD._

# **5\. Environment Variables**

| **Variable**                  | **Value**                       | **Used By**                                |
| ----------------------------- | ------------------------------- | ------------------------------------------ |
| NEXT_PUBLIC_SUPABASE_URL      | https://\[project\].supabase.co | Client + server                            |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | \[anon key\]                    | Client + server                            |
| OPENAI_API_KEY                | \[api key\]                     | Server only (/api/chat)                    |
| LLM_PROVIDER                  | openai                          | Server only - router: 'openai' \| 'ollama' |
| LLM_MODEL                     | gpt-5.5                         | Server only - override per environment     |

_LLM_PROVIDER and LLM_MODEL are the two variables you change to swap the model. In local dev, set LLM_PROVIDER=ollama and point at your local Ollama instance for free experimentation. If Claude is desired later, add an Anthropic provider implementation and set LLM_PROVIDER to that provider key._

# **6\. Release Plan**

The PRD defines four milestones (M1-M4). This plan maps those to concrete shipped states and adds a pre-launch local dev phase.

## **Phase 0 - Local Dev Setup (Day 1-2)**

- Initialize Next.js 14 project with App Router, Tailwind, TypeScript
- Connect Supabase - create activities table and unique index
- Configure Vercel project, link GitHub repo, set environment variables
- Install OpenAI SDK, wire LLM router with OpenAI as default
- Verify Ollama works locally as fallback (optional but recommended)
- Validate Garmin CSV export format against real data - confirm field names and units

## **M1 - Data Pipeline**

Done when: Upload a real Garmin CSV export, see correct row counts, re-upload without duplicates.

- PapaParse client-side CSV parsing with field mapping to activity schema
- POST /api/upload with upsert logic (ON CONFLICT DO NOTHING on unique index)
- Response: { inserted: N, skipped: M } displayed in upload UI
- Drag-and-drop + file picker upload component
- Validate VO2 max field presence in Garmin CSV export

## **M2 - Chat Baseline**

Done when: Can ask 'am I getting faster?' and receive a data-grounded streamed response.

- GET /api/activities returning last 12 months of running activities
- POST /api/chat (Edge Runtime) - fetch activities, serialize compact JSON, build system prompt, call LLM router, stream SSE
- Chat UI: standard thread layout, streaming token rendering, starter prompts on empty state
- Session-only history (in-memory React state, clears on refresh)

## **M3 - Dashboard**

Done when: Pace/HR trend, VO2 Max trend, and weekly mileage charts render on page load from live data.

- Recharts: Pace vs HR line chart (90-day rolling window)
- Recharts: VO2 Max trend line chart (all-time)
- Recharts: Weekly mileage bar chart (last 16 weeks)
- Recent runs table (last 10 activities)
- All charts computed client-side from /api/activities response

## **M4 - Polish & Deploy**

Done when: Runs on Vercel, upload UX is clear, chat has starter prompts, no broken states.

- Vercel deploy with all environment variables configured
- Confirm Edge Runtime on /api/chat - test streaming end-to-end in production
- Upload error states (unrecognized CSV format, network failure)
- Responsive layout check
- Smoke test all milestone-defining questions from the PRD

# **7\. Aerobic Efficiency Metric**

The PRD's primary fitness question - 'Am I getting faster and fitter over time?' - requires a formally defined metric. Without it, dashboard charts and model answers will calculate fitness differently and produce inconsistent results.

## **7.1 Definition**

Aerobic efficiency measures how much speed you produce per heartbeat. A higher number means you are running faster at the same cardiovascular cost.

| **Field**       | **Value**                                           |
| --------------- | --------------------------------------------------- |
| Formula         | speed_m_per_sec / avg_hr                            |
| speed_m_per_sec | (distance_km \* 1000) / duration_seconds            |
| Unit            | meters per second per beat (m/s/bpm)                |
| Stored as       | Computed at query time - not stored as a raw column |
| Display format  | Round to 4 decimal places (e.g., 0.0423)            |

_Example: 10km in 3600s with avg HR 145 → speed = 2.778 m/s → efficiency = 2.778 / 145 = 0.01916. As fitness improves, this number rises even when pace is the same, because HR drops._

## **7.2 Eligible Runs**

Apply these filters consistently across dashboard charts and chat context:

| **Rule**         | **Threshold**            | **Rationale**                                     |
| ---------------- | ------------------------ | ------------------------------------------------- |
| Minimum distance | \>= 3.0 km               | Very short runs produce noisy efficiency readings |
| Minimum avg HR   | \>= 120 bpm              | Walks and cool-downs have artificially low HR     |
| Maximum avg HR   | <= 185 bpm               | Outlier filter for HR sensor errors               |
| Activity type    | \= 'Running'             | Exclude cycling, hiking, strength, etc.           |
| Minimum duration | \>= 900 seconds (15 min) | Exclude GPS blips and accidental starts           |

## **7.3 Trend Comparison**

- Rolling 30-day avg efficiency = AVG(efficiency) over eligible runs in a 30-day window
- Compare current 30-day avg to the same window from 3, 6, and 12 months prior
- A delta of +5% or more over 90 days is a meaningful improvement signal
- Pre-compute the 30d / 90d / 180d snapshots and inject into the OpenAI prompt context

_Pre-computing efficiency snapshots before the prompt is built ensures the model gives consistent answers and doesn't re-derive the metric differently each time._

# **8\. System Prompt Specification**

The system prompt is product logic. It should be stored in lib/llm/prompts.ts as a versioned constant - not hardcoded in the route - so changes can be tracked and regressions bisected.

## **8.1 Message Structure**

| **Role**  | **Content**                                                           | **Notes**                                              |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| system    | Persona + constraints + pre-computed efficiency stats + activity JSON | Built fresh per request from live data                 |
| user      | The user's current message                                            | Passed through verbatim                                |
| assistant | Previous responses in the session                                     | In-memory React state only - clears on refresh for MVP |

## **8.2 System Prompt Template**

_You are Aeris, a data-driven personal running analyst. You help the user understand their training data, identify trends, and answer questions about their fitness over time._

**Rules:**

- Answer using only the supplied running data. Never invent statistics or fabricate run details.
- When making a claim, cite the relevant run dates or time periods.
- Explain your reasoning - show the trend, not just the conclusion.
- Quantify comparisons wherever possible (e.g., '4.2% faster over 90 days').
- Acknowledge uncertainty explicitly when the data is noisy or sparse.
- If a question cannot be answered from the supplied data, say so directly.

**Injected context:**

- Aerobic efficiency - 30-day avg: {efficiency_30d}
- Aerobic efficiency - 90 days ago: {efficiency_90d}
- Aerobic efficiency - 180 days ago: {efficiency_180d}
- Recent activities (running, last 12 months, compact JSON): {activities_json}

_Prompt version constant: export const PROMPT_VERSION = 'v1.0'. Increment when the prompt changes meaningfully. Keep prior versions commented for rollback reference._

# **9\. Dashboard Calculation Definitions**

All calculations live in lib/calculations.ts as pure functions, reused by both dashboard components and the chat context builder. Decisions are made once here - not ad hoc during coding.

## **9.1 Weekly Mileage Bar Chart**

| **Field**       | **Definition**                                              |
| --------------- | ----------------------------------------------------------- |
| Metric          | Total distance in km per ISO week                           |
| SQL equivalent  | SUM(distance_km) GROUP BY date_trunc('week', activity_date) |
| Display window  | Last 16 weeks                                               |
| Activity filter | All types (total training load, not running only)           |
| Null weeks      | Show as 0 - do not omit weeks with no data                  |
| Units           | km (no miles conversion for MVP)                            |

## **9.2 Pace vs Heart Rate Line Chart**

| **Field**      | **Definition**                                                                  |
| -------------- | ------------------------------------------------------------------------------- |
| Metric         | Dual-axis: avg pace (min/km) and avg HR (bpm) per eligible run                  |
| Display window | Last 90 days                                                                    |
| Eligible runs  | Running only, >= 3km, avg HR >= 120 (same as efficiency filter)                 |
| Pace display   | Convert avg_pace_sec_per_km to min:sec for Y-axis labels                        |
| Smoothing      | None for MVP - raw per-run values. Add 7-day rolling avg post-MVP if too noisy. |
| Axes           | Pace on left Y-axis (inverted - lower is faster). HR on right Y-axis.           |

## **9.3 VO2 Max Trend Line Chart**

| **Field**      | **Definition**                                                          |
| -------------- | ----------------------------------------------------------------------- |
| Metric         | Garmin-reported VO2 max estimate per run                                |
| Display window | All-time (full history)                                                 |
| Null handling  | Skip runs where vo2max_estimate IS NULL - do not plot zero              |
| Outlier rule   | Exclude values &lt; 30 or &gt; 80 (Garmin sensor errors)                |
| Smoothing      | 7-run rolling average overlaid on raw dots                              |
| Minimum data   | If fewer than 5 non-null values exist, show 'Not enough data yet' state |

## **9.4 Aerobic Efficiency Trend**

| **Field**      | **Definition**                                                        |
| -------------- | --------------------------------------------------------------------- |
| Metric         | speed_m_per_sec / avg_hr per eligible run                             |
| Display window | Last 6 months                                                         |
| Eligible runs  | Same filter as Section 7.2                                            |
| Smoothing      | 30-day rolling average line overlaid on raw run dots                  |
| Reference line | Dotted horizontal at the 90-day-ago rolling avg for visual comparison |

_lib/calculations.ts exports: calcEfficiency(run), calcWeeklyMileage(runs), calcRollingAvg(runs, windowDays). Pure functions - no Supabase dependency, easy to unit test._

# **10\. Garmin CSV Field Mapping**

Maps raw Garmin Connect CSV export fields to Aeris internal schema. Validate against a real export before writing the parser - field names vary by device and firmware version.

| **Garmin CSV Field** | **Internal Field**  | **Transform**                | **Notes**                                         |
| -------------------- | ------------------- | ---------------------------- | ------------------------------------------------- |
| Date                 | activity_date       | Parse datetime → timestamptz | Format: YYYY-MM-DD HH:MM:SS                       |
| Activity Type        | activity_type       | Store as-is                  | Filter to 'Running' for chat context              |
| Distance             | distance_km         | Parse float                  | Confirm Garmin exports km (not miles) in settings |
| Time                 | duration_seconds    | HH:MM:SS → integer seconds   |                                                   |
| Avg Pace             | avg_pace_sec_per_km | MM:SS → integer seconds      | e.g., '5:42' → 342                                |
| Avg HR               | avg_hr              | Parse integer                | '--' if no HR monitor → store NULL                |
| Max HR               | max_hr              | Parse integer                | Same null handling as Avg HR                      |
| Calories             | calories            | Parse integer                |                                                   |
| Total Ascent         | ascent_m            | Parse integer                | May be labeled 'Elev Gain' on some devices        |
| VO2 Max              | vo2max_estimate     | Parse float                  | May not appear in export - store NULL if absent   |

**Parser rules:**

- Any field containing '--' → store as NULL, not 0
- If activity_date, distance_km, or duration_seconds is null → skip row, count as skipped
- Store full raw row in raw_csv_row jsonb for forward compatibility
- Log all skipped rows with reason - surface count and details in upload response

# **11\. Data Access Layer**

All Supabase calls go through lib/activityRepository.ts. Route handlers stay thin. Calculations stay testable. Database can be swapped without touching routes.

| **Function**                 | **Signature**                                          | **Used By**                               |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| getActivities()              | (): Promise&lt;Activity\[\]&gt;                        | /api/activities, dashboard                |
| getRecentActivities(months?) | (months?: number): Promise&lt;Activity\[\]&gt;         | /api/chat context builder (default: 12mo) |
| getEfficiencyStats()         | (): Promise&lt;EfficiencySnapshot&gt;                  | Chat system prompt builder                |
| insertActivities(rows)       | (rows: ActivityInput\[\]): Promise&lt;UpsertResult&gt; | /api/upload                               |

_UpsertResult: { inserted: number, skipped: number, errors: string\[\] }. EfficiencySnapshot: { eff30d: number | null, eff90d: number | null, eff180d: number | null }._

# **12\. Failure Handling**

## **12.1 Upload**

| **Scenario**                  | **Behavior**                           | **User Message**                                                                      |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| Unrecognized CSV format       | Fail entire upload immediately         | 'This doesn't look like a Garmin export. Use the Activities CSV from Garmin Connect.' |
| Individual row parse error    | Skip row, continue, log reason         | Shown in summary: '148 imported, 2 skipped'                                           |
| Required field null           | Skip row, count as skipped             | Included in skipped count with reason                                                 |
| Duplicate (hits unique index) | Skip silently (ON CONFLICT DO NOTHING) | Counted in skipped - not flagged as error                                             |
| Supabase connection failure   | Fail entire upload                     | 'Upload failed - please try again.'                                                   |
| File > 10MB                   | Reject before parsing                  | 'File too large. Export a smaller range from Garmin Connect.'                         |

## **12.2 Chat**

| **Scenario**                  | **Behavior**                   | **User Message**                                        |
| ----------------------------- | ------------------------------ | ------------------------------------------------------- |
| OpenAI API timeout (> 30s)    | Retry once, then surface error | 'Taking longer than expected. Please try again.'        |
| OpenAI API error (5xx)        | Surface error immediately      | 'Something went wrong. Please try again.'               |
| No activities uploaded        | Block chat, show upload CTA    | 'Upload your Garmin data to start chatting with Aeris.' |
| Stream interrupted            | Show partial + error indicator | 'Response interrupted. Here's what I had so far...'     |

## **12.3 Dashboard**

| **Scenario**                    | **Behavior**                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| No activities in database       | Empty state with upload CTA on all chart panels                              |
| Insufficient data for one chart | 'Not enough data yet' within that panel only - rest of page renders normally |
| /api/activities fetch error     | Error state with retry button - no stale data shown                          |

# **13\. API Contracts**

## **GET /api/activities → Activity\[\]**

| **Field**       | **Type**          | **Notes**                                                   |
| --------------- | ----------------- | ----------------------------------------------------------- |
| id              | string (uuid)     |                                                             |
| activityDate    | string (ISO 8601) | e.g. '2025-11-03T07:22:00Z'                                 |
| activityType    | string            | e.g. 'Running'                                              |
| distanceKm      | number            |                                                             |
| durationSeconds | number            |                                                             |
| avgPaceSecPerKm | number \| null    |                                                             |
| avgHr           | number \| null    |                                                             |
| maxHr           | number \| null    |                                                             |
| calories        | number \| null    |                                                             |
| ascentM         | number \| null    |                                                             |
| vo2maxEstimate  | number \| null    |                                                             |
| efficiency      | number \| null    | Computed: speed_m_per_sec / avg_hr. Null if avg_hr is null. |

## **POST /api/upload → UpsertResult**

Request: multipart/form-data, field name 'file'.

| **Field** | **Type**   | **Notes**                                 |
| --------- | ---------- | ----------------------------------------- |
| inserted  | number     | Rows written to database                  |
| skipped   | number     | Rows skipped (duplicates + parse errors)  |
| errors    | string\[\] | Human-readable skip reasons, max 20 shown |

## **POST /api/chat → SSE Stream**

Request body: { message: string, history: { role: 'user' | 'assistant', content: string }\[\] }

Response: text/event-stream. Each event: { delta: string }. Final event: { done: true }.

# **14\. MVP Acceptance Tests**

The app is shippable when it correctly answers all of the following questions from real Garmin data. Run these against real exports - synthetic data passes trivially.

| **#** | **Question**                                | **Good Answer Looks Like**                                                                                                                      |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Am I getting faster at the same heart rate? | Cites aerobic efficiency trend with specific numbers and date range. States direction (improving / flat / declining) with a percentage delta.   |
| 2     | What was my fastest 10K equivalent run?     | Returns a specific run by date, pace, and distance. Handles imprecise distances gracefully.                                                     |
| 3     | Which month had my highest mileage?         | Returns correct month and km total. Cross-check against dashboard weekly chart.                                                                 |
| 4     | How has my VO2 max changed over 6 months?   | Returns start value, end value, trend direction. Handles null values without hallucinating.                                                     |
| 5     | Which run had my best pace-to-HR ratio?     | Returns the run with highest efficiency score by date, pace, and HR. Matches lib/calculations.ts output.                                        |
| 6     | Am I overtraining?                          | Does not hallucinate. Derives a reasonable signal from HR or mileage trends, or explicitly states it cannot determine this from available data. |
| 7     | How many miles did I run last week?         | Returns correct weekly total. Converts km to miles if asked, or notes the unit.                                                                 |

# **15\. Post-MVP Investment Areas**

| **Area**                                 | **What It Unlocks**                                                          | **Effort**                |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| Query-aware context filtering (PRD §8.1) | Lower cost, faster responses. Parse question intent before building prompt.  | Medium                    |
| Precomputed aggregates table (PRD §8.2)  | Monthly/weekly rollups reduce context size by 10x for most queries.          | Medium                    |
| Prompt caching (PRD §8.4)                | ≥80% cache hit rate on system prompt = ~90% cost reduction on cached tokens. | Low                       |
| Full historical data scope               | Extend context window beyond 12 months using aggregate strategy.             | Low (after §8.2)          |
| Garmin OAuth / live sync                 | Replace manual CSV upload with automated sync.                               | High                      |
| Persistent chat history                  | Carry conversation context across sessions.                                  | Low-Medium                |
| pgvector (run notes)                     | Semantic search if unstructured journal/note fields are added.               | Low - already in Supabase |
| Multi-user + Supabase Auth               | Row-level security already supported. Add auth provider, RLS policies.       | Medium - arch is ready    |

_Multi-user note: The current single-table, no-RLS architecture is fine for personal use. Adding multi-user requires: (1) a user_id column on activities, (2) Supabase RLS policies scoped to auth.uid(), (3) an auth provider (Supabase Auth has Google/GitHub OAuth built in). The schema change is a single migration. No structural rethink required._

# **16\. Open Questions (Carried from PRD)**

| **Question**                                                    | **Priority**           | **Resolution Path**                                            |
| --------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| Exact Garmin CSV field names and units                          | P0 - blocks M1         | Validate against a real export before writing the parser       |
| Does Garmin include VO2 max in CSV export?                      | P1 - affects dashboard | Check real export; fall back to null if absent                 |
| Context payload size at 12-month scope                          | P1 - affects cost      | Measure token count with real data before M2 deploy            |
| Should chat answer clarifying questions or answer directly?     | P2 - UX decision       | Start with direct answers; revisit if responses feel too broad |
