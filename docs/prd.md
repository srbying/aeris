**AERIS**

Running Analytics Chat App

Product Requirements Document - MVP

| **Version** | 1.0 - MVP |
| ----------- | --------- |
| **Author**  | Steven    |
| **Date**    | May 2026  |
| **Status**  | Draft     |

# **1\. Overview**

## **1.1 Problem Statement**

Runners using Garmin Connect have access to rich activity data but no easy way to interrogate it. Comparing runs requires manual, one-at-a-time lookups with no guidance on what to compare or why. There is no conversational interface that lets a runner ask plain-English questions about their fitness trajectory and get data-backed answers.

## **1.2 Product Vision**

Aeris is a personal running analytics tool built around a chat interface. You upload your Garmin activity data once, and then ask questions the way you would ask a knowledgeable training partner. A lightweight dashboard surfaces key trends automatically; chat is where the real insight unlocks.

## **1.3 Primary Goal (MVP)**

Answer one question better than any tool currently does:

**_"Am I getting faster and fitter over time?"_**

Everything in the MVP exists to answer this question with real data.

## **1.4 Out of Scope for MVP**

| **The following are explicitly excluded from MVP scope:**          |
| ------------------------------------------------------------------ |
| • Live Garmin API sync / OAuth integration                         |
| • Support for other fitness platforms (Strava, Apple Health, etc.) |
| • Training plan generation or coaching recommendations             |
| • Mobile native app                                                |
| • Multi-user support or social features                            |
| • Race prediction or event planning tools                          |
|                                                                    |

# **2\. User**

## **2.1 Target User (MVP)**

A single user: Steven. No authentication, no multi-tenancy. This is a personal tool.

| **Who**               | Solo runner, data-curious, trains by heart rate and effort  |
| --------------------- | ----------------------------------------------------------- |
| **Device**            | Garmin watch with HR monitor worn every run                 |
| **Data source**       | Manual CSV export from Garmin Connect                       |
| **Primary signal**    | Pace at equivalent heart rate (aerobic efficiency)          |
| **Secondary signals** | VO2 max trend, race times, weekly volume                    |
| **Pain point**        | No way to ask cross-run questions without manual comparison |

## **2.2 Core User Need**

The user wants to upload their activity history once and then query it conversationally over time. New runs should be addable without re-uploading the full history. Every chat session should have access to the complete accumulated dataset.

# **3\. Features**

## **3.1 Feature Priority**

| **Feature**                       | **Priority**      | **Rationale**                                        |
| --------------------------------- | ----------------- | ---------------------------------------------------- |
| CSV upload + deduplication        | P0 - Must Have    | Core data pipeline; nothing works without it         |
| Persistent activity store         | P0 - Must Have    | Upload once, query forever requirement               |
| Chat interface (OpenAI-backed)    | P0 - Must Have    | Primary differentiator                               |
| Trend dashboard                   | P1 - Should Have  | Ambient context; reduces need to ask basic questions |
| Duplicate prevention on re-upload | P1 - Should Have  | Critical for good UX on incremental uploads          |
| Export / data clear               | P2 - Nice to Have | Useful but not blocking                              |

## **3.2 CSV Upload and Parsing**

The user exports activity data from Garmin Connect (Activities > Export CSV) and uploads the file to Aeris. The app parses each row and upserts it into the activity store.

### **Garmin CSV fields used:**

- Activity Type
- Date
- Distance
- Calories
- Time (duration)
- Avg HR / Max HR
- Avg Pace
- Total Ascent / Descent
- Avg Aeris Length
- Best Pace
- Avg Run Cadence

### **Deduplication logic:**

Unique constraint on (date + activity_type + distance). On re-upload, rows already in the database are skipped. Only net-new activities are inserted. The UI reports how many rows were added vs. skipped.

## **3.3 Persistent Activity Store**

All parsed activities are stored in a Supabase Postgres table. There is no session-scoped data; everything persists indefinitely. The store is append-only from the user's perspective.

### **Activity table schema (key columns):**

- id - uuid primary key
- activity_date - timestamptz
- activity_type - text (filtered to running only for chat context)
- distance_km - numeric
- duration_seconds - integer
- avg_pace_sec_per_km - integer
- avg_hr - integer
- max_hr - integer
- calories - integer
- ascent_m - integer
- vo2max_estimate - numeric (Garmin-reported if present)
- raw_csv_row - jsonb (full original row for future use)
- created_at - timestamptz

## **3.4 Chat Interface**

The primary interaction surface. The user types a question in plain English. The app queries the full activity history from Supabase, formats it as structured context, and sends it along with the user's question to the OpenAI Responses API. The response is streamed back and displayed in a chat thread.

### **Example questions the MVP must handle:**

- "Am I running faster at the same heart rate compared to 3 months ago?"
- "What was my best aerobic efficiency run this year?"
- "How does my average pace trend over the last 6 months?"
- "How many miles did I log in April vs March?"
- "What does my VO2 max trend look like?"
- "Which of my runs had the best pace-to-HR ratio?"

### **Context strategy:**

Each chat request pulls all running activities from Supabase, serialized as a compact JSON array (date, distance, avg_pace, avg_hr, vo2max). This is injected into the OpenAI prompt context along with a persona prompt that instructs the model to act as a data-driven running analyst. No chat history is persisted server-side for MVP; each session starts fresh (the dataset provides continuity).

## **3.5 Trend Dashboard**

A lightweight visual layer that surfaces key metrics without requiring a chat question. Renders on initial page load from live Supabase data.

### **Dashboard panels (MVP):**

- Pace vs. Heart Rate over time - line chart, 90-day rolling window
- VO2 Max trend - line chart, all-time
- Weekly mileage - bar chart, last 16 weeks
- Recent runs table - last 10 activities with key stats

# **4\. Technical Architecture**

## **4.1 Stack**

| **Framework**   | Next.js (App Router)         |
| --------------- | ---------------------------- |
| **Database**    | Supabase (Postgres)          |
| **AI**          | OpenAI API (gpt-5.5 via Responses API) |
| **Charts**      | Recharts                     |
| **Styling**     | Tailwind CSS                 |
| **Deployment**  | Vercel                       |
| **CSV parsing** | PapaParse                    |

## **4.2 Data Flow**

### **Upload flow:**

- User selects Garmin CSV export file
- PapaParse parses client-side into JSON array
- POST to /api/upload - deduplicates and upserts to Supabase
- Response: { inserted: N, skipped: M } shown in UI

### **Chat flow:**

- User submits message
- GET /api/activities - fetches all running activity rows from Supabase
- POST /api/chat - constructs prompt with activity data + user message, calls OpenAI Responses API
- Response streamed back via Server-Sent Events
- Message appended to in-memory chat thread

### **Dashboard flow:**

- On page load, GET /api/activities returns full dataset
- Recharts renders from client-side computed aggregates
- No separate dashboard API - reuses activity endpoint

## **4.3 Supabase Configuration**

- Single table: activities
- Unique index on (activity_date, activity_type, distance_km) for deduplication
- No RLS required (single-user personal tool)
- export const dynamic = 'force-dynamic' on all API routes that query Supabase

# **5\. UX and Interface**

## **5.1 Page Structure**

| **/ (home)**        | Dashboard panels + upload button + chat interface    |
| ------------------- | ---------------------------------------------------- |
| **/api/upload**     | POST endpoint: CSV ingestion                         |
| **/api/activities** | GET endpoint: all activities as JSON                 |
| **/api/chat**       | POST endpoint: chat completion with activity context |

Single-page app. Dashboard sits above the fold. Chat panel is below or in a side drawer. Upload is accessible via a persistent button (top nav or dashboard header).

## **5.2 Upload UX**

- Drag-and-drop or file picker for CSV
- Progress indicator while parsing and upserting
- Success state: "47 runs added, 12 already existed"
- Error state: clear message if CSV format is unrecognized

## **5.3 Chat UX**

- Standard chat thread layout (user right, assistant left)
- Streaming response (no spinner wait)
- Session-only history (refreshing clears the thread)
- Starter prompts shown when thread is empty to guide first-time use

# **6\. Build Milestones**

| **Milestone**     | **Deliverable**                         | **Done When**                                                          |
| ----------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| M1: Data pipeline | CSV upload + Supabase upsert working    | Can upload Garmin export, see row counts, re-upload without duplicates |
| M2: Chat baseline | Chat interface returning real answers   | Can ask 'am I getting faster?' and get a data-grounded response        |
| M3: Dashboard     | 3 trend charts rendering from live data | Pace/HR, VO2 max, weekly volume charts visible on load                 |
| M4: Polish        | Deployment + UX cleanup                 | Runs on Vercel, upload UX clear, chat starter prompts in place         |

# **7\. Future Considerations (Post-MVP)**

The following are not requirements for MVP but should not be designed against:

- Garmin OAuth / live sync to replace manual CSV upload
- Strava, Apple Health, and other platform integrations
- Persistent chat history across sessions
- Training load and recovery scoring
- Race goal setting and progress tracking toward a target event
- Mobile-optimized or native app experience
- Multi-user support with auth

# **8\. Fast Follow: Token Optimization**

The MVP sends full activity history as context on every chat request. This is intentionally simple and sufficient for early usage, but will become costly and slow as the dataset grows. The following optimizations should be implemented as the first post-MVP engineering investment, roughly in order of impact:

### **1\. Query-aware context selection (highest leverage)**

Parse the user's question before building the prompt and filter the dataset to only what is relevant:

- 'How was April?' - send only April rows
- 'Am I getting faster?' - send monthly aggregates, not daily rows
- 'What was my best run?' - send top 10 by pace-to-HR ratio only

Requires a lightweight classification step before the main model call, or a two-pass approach where the first pass determines what data to pull.

### **2\. Precomputed aggregates in Supabase**

Run a background job or Supabase trigger on upload that maintains a summaries table with weekly and monthly rollups (avg pace, avg HR, total distance, VO2 max). Chat queries hit the summary table by default and drop to raw rows only when the question specifically requires run-level detail. This reduces context size by an order of magnitude for most queries.

### **3\. Compress the row schema**

Strip field names to terse keys and drop verbose labels before serializing to the prompt. Example:

- Verbose: { "activity_date": "2026-05-17", "avg_pace_sec_per_km": 522, "avg_hr": 143 }
- Compressed: { "d": "2026-05-17", "pace": 522, "hr": 143 }

Across 500 rows this meaningfully reduces token count with no loss of fidelity for the model.

### **4\. OpenAI prompt caching**

OpenAI supports prompt caching for repeated prompt prefixes. If static instructions and reusable activity context are kept at the beginning of the prompt, cache hits can reduce latency and input token cost on repeated chat turns without changing response quality. For a large dataset this is a significant saving on multi-turn conversations.

| **Target state post-optimization:**                                    |
| ---------------------------------------------------------------------- |
| • Default query: monthly aggregates only (≤50 rows, ≤1K tokens)        |
| • Detail query: filtered raw rows for specific date ranges (≤100 rows) |
| • Full history: reserved for explicit trend analysis requests          |
| • Prompt cache hit rate ≥80% of chat turns within a session            |
|                                                                        |

# **9\. Open Questions**

- What is the Garmin bulk CSV export format exactly? Field names and units need to be validated against a real export before building the parser.
- Does Garmin include VO2 max as a column in the CSV export, or is it only available via the Connect app UI?
- How large will the context payload get over time? At 5 runs/week over 2 years, that is ~500 activity rows. Need to validate that this fits cleanly in the selected OpenAI model's context window without truncation or cost concerns.
- Should the chat persona be instructed to ask clarifying questions (e.g., 'do you want to compare effort-matched runs only?') or always answer directly with a best-effort interpretation?
