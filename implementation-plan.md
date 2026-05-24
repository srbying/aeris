# Aeris MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Follow Red/Green/Refactor. Do not write production code before a failing test exists.

**Goal:** Build a single-user running analytics chat app that answers, "Am I getting faster and fitter over time?" using Garmin CSV data, Supabase, OpenAI, and dashboard trends.

**Scope:** MVP only. No authentication, multi-tenancy, vector database, coaching recommendations, or training plans.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres, OpenAI GPT-5.5 via Responses API, Recharts, Tailwind CSS, Zod, Vitest, Playwright, PapaParse.

---

## Architecture

Aeris is a single-page Next.js app with three server routes, a thin repository layer around Supabase, pure calculation modules for fitness metrics, and an OpenAI-backed chat route that streams responses. The app stores all uploaded activities in one Supabase table and computes dashboard and chat context from the persisted activity data.

The data pipeline starts with a Garmin CSV upload. The client parses the file with PapaParse, validates rows with Zod-compatible schemas, sends normalized rows to `/api/upload`, and the server inserts only net-new activities using the unique key `(activity_date, activity_type, distance_km)`.

The dashboard and chat share the same canonical activity model. `GET /api/activities` returns normalized activities for dashboard charts. `POST /api/chat` fetches recent running activities and efficiency snapshots, builds the prompt through an LLM router, calls OpenAI, and streams the response to the chat UI.

### Core Boundaries

- `app/` owns routes, page composition, and API handlers.
- `components/` owns client-facing upload, dashboard, and chat UI.
- `lib/activity/` owns activity schemas, parsing, formatting, and repository access.
- `lib/calculations/` owns pure metric calculations shared by dashboard and chat context.
- `lib/llm/` owns provider interfaces, OpenAI implementation, prompt construction, and streaming helpers.
- `supabase/` owns database schema and migrations.
- `tests/` owns unit, integration, and acceptance coverage.

### Runtime Decisions

- `/api/chat` uses the Edge Runtime for streaming and Vercel free-tier timeout safety.
- `/api/upload` and `/api/activities` use dynamic Node.js/serverless routes.
- Supabase access stays behind the repository layer.
- No RLS is required for MVP because the product is explicitly single-user and unauthenticated.
- No vector database is used; the model receives structured activity context, not semantic search results.

### Data Model

The MVP uses one `activities` table with:

- `id`
- `activity_date`
- `activity_type`
- `distance_km`
- `duration_seconds`
- `avg_pace_sec_per_km`
- `avg_hr`
- `max_hr`
- `calories`
- `ascent_m`
- `vo2max_estimate`
- `raw_csv_row`
- `created_at`

The app computes aerobic efficiency at query time as speed divided by average heart rate. Eligible efficiency runs must be running activities with distance at least 3 km, duration at least 15 minutes, average HR from 120 to 185 bpm, and sufficient pace/duration data.

The chat context window defaults to `ACTIVITY_CONTEXT_MONTHS=12`. Treat this as configuration, not a hardcoded product decision, so the default can be adjusted after testing real Garmin history volume and OpenAI context cost.

---

## Milestones

### Milestone 0: Project Foundation

**Outcome:** A strict TypeScript Next.js app exists with test tooling, Tailwind, Supabase configuration, and baseline structure.

**Work:**

- Initialize Next.js App Router project in the existing repository.
- Configure TypeScript strict mode, Tailwind, ESLint, Vitest, and Playwright.
- Add environment variable documentation for Supabase, OpenAI, and LLM routing.
- Add Supabase migration for the `activities` table and unique deduplication index.
- Add shared domain types and Zod schemas before implementing route behavior.

**TDD focus:**

- First failing tests validate activity schema parsing and required environment handling.
- Green state proves local test runner, type checking, and build are wired correctly.

**Done when:**

- Unit tests pass.
- Type checks pass.
- Build passes.
- Database migration represents the PRD schema and deduplication rule.

### Milestone 1: Data Pipeline

**Outcome:** The user can upload a Garmin CSV export, insert valid activities, skip invalid or duplicate rows, and see inserted/skipped counts.

**Work:**

- Implement Garmin CSV field mapping and normalization.
- Validate fields including dates, distance, duration, pace, HR, elevation, calories, VO2 max, and raw row preservation.
- Implement repository insert/upsert behavior with inserted, skipped, and error counts.
- Implement `/api/upload` with file-size and CSV-format failure handling.
- Build drag-and-drop/file-picker upload UI with progress, success, and error states.

**TDD focus:**

- Parser tests cover valid Garmin rows, missing optional fields, `--` null values, invalid required fields, and unit assumptions.
- Repository tests cover inserts, duplicates, and skipped row accounting.
- API tests cover success, unrecognized CSV, large file, and Supabase failure.
- Playwright upload flow verifies visible row count feedback.

**Done when:**

- A real Garmin export can be uploaded.
- Re-uploading the same file does not create duplicates.
- The UI reports counts in the format expected by the PRD.
- Tests, types, and build pass.

### Milestone 2: Activity Retrieval and Shared Calculations

**Outcome:** Activities can be fetched from Supabase and transformed into dashboard-ready and chat-ready metrics consistently.

**Work:**

- Implement repository methods for all activities, recent activities filtered by `ACTIVITY_CONTEXT_MONTHS`, and efficiency snapshots.
- Implement pure calculation functions for aerobic efficiency, rolling averages, weekly mileage, pace/HR chart data, efficiency trend chart data, VO2 trend data, and recent run formatting.
- Implement `/api/activities` with `force-dynamic` behavior.
- Normalize API response fields to the public contract in the technical plan.

**TDD focus:**

- Calculation tests cover eligibility filters, efficiency values, weekly mileage with empty weeks, VO2 null/outlier handling, and rolling windows.
- Repository/API tests cover sorting, date windows, and serialized response shape.

**Done when:**

- `GET /api/activities` returns normalized persisted activities.
- Chat context filtering uses `ACTIVITY_CONTEXT_MONTHS=12` by default and can be changed through environment configuration.
- Dashboard and chat can depend on the same calculation outputs.
- Tests, types, and build pass.

### Milestone 3: Dashboard

**Outcome:** The home page renders the MVP dashboard from live activity data.

**Work:**

- Build dashboard composition above the fold.
- Add Pace vs Heart Rate chart for eligible runs in the last 90 days.
- Add Aerobic Efficiency Trend chart for eligible runs in the last 6 months.
- Add VO2 Max trend chart with null and outlier handling.
- Add weekly mileage bar chart for the last 16 weeks.
- Add recent runs table for the last 10 activities.
- Add empty, insufficient-data, loading, and fetch-error states.

**TDD focus:**

- Component tests verify each chart receives correctly shaped data and displays empty states.
- Playwright tests verify dashboard panels render after mocked or seeded data loads.

**Done when:**

- The four dashboard trend panels and recent runs table render on page load.
- Insufficient data in one panel does not break the rest of the page.
- Tests, types, and build pass.

### Milestone 4: Chat Baseline

**Outcome:** The user can ask fitness questions and receive streamed, data-grounded OpenAI responses.

**Work:**

- Implement LLM provider interface and OpenAI provider.
- Add LLM factory using `LLM_PROVIDER` and `LLM_MODEL`.
- Store the Aeris system prompt as a versioned constant.
- Build chat context from running activities filtered by `ACTIVITY_CONTEXT_MONTHS`, compact JSON, and efficiency snapshots.
- Implement `/api/chat` as an Edge Runtime streaming route.
- Build chat UI with starter prompts, session-only history, streaming assistant messages, and error states.

**TDD focus:**

- Prompt builder tests verify constraints, context inclusion, compact activity format, and no coaching/training-plan language.
- Chat route tests verify empty dataset handling, request validation, streaming events, and provider errors.
- Playwright tests verify a user can submit a question and see streamed output.

**Done when:**

- "Am I getting faster at the same heart rate?" receives a grounded answer using supplied data.
- Chat refuses to fabricate answers when data is insufficient.
- The route streams instead of waiting for a full response.
- Tests, types, and build pass.

### Milestone 5: Acceptance Coverage

**Outcome:** The documented MVP acceptance questions are covered by repeatable tests.

**Work:**

- Create deterministic seed data representing six months of runs.
- Cover all seven acceptance scenarios in `docs/acceptance-tests.md`.
- Ensure the monthly mileage spec covers both April-versus-March comparison and highest-mileage-month aggregation.
- Verify dashboard and chat calculations agree for shared metrics.

**TDD focus:**

- Acceptance tests drive any remaining behavior gaps before production polish.
- Each failing acceptance scenario is fixed with minimal implementation, then refactored.

**Done when:**

- Fitness trend, monthly mileage, VO2 trend, best aerobic run, fastest 10K equivalent, overtraining guardrail, and miles-last-week scenarios pass.
- The app can answer with correct calculations and confidence language.
- Tests, types, and build pass.

### Milestone 6: Polish and Deployment

**Outcome:** Aeris is usable locally and deployed to Vercel with the MVP flows intact.

**Work:**

- Configure Vercel environment variables.
- Confirm Supabase connection from production.
- Confirm Edge Runtime streaming in production.
- Add clear upload and chat error messages from the technical plan.
- Run responsive checks for the single-page layout.
- Run a final smoke test with real Garmin export data.

**TDD focus:**

- Regression tests cover discovered production-readiness bugs.
- Playwright smoke coverage verifies the primary upload, dashboard, and chat path.

**Done when:**

- Tests pass.
- Build passes.
- Types pass.
- Acceptance criteria pass.
- Vercel deployment serves the MVP successfully.

---

## Dependencies

### External Services

- Supabase project with Postgres enabled.
- OpenAI API key with access to the selected default model.
- Vercel project for deployment.
- Optional local Ollama runtime for provider experimentation.

### Runtime Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `LLM_PROVIDER=openai`
- `LLM_MODEL=gpt-5.5`
- `ACTIVITY_CONTEXT_MONTHS=12`

### Application Packages

- Next.js
- TypeScript
- Tailwind CSS
- Supabase JavaScript client
- OpenAI SDK
- Recharts
- PapaParse
- Zod
- Vitest
- Testing Library
- Playwright

### Data Dependencies

- Real Garmin Connect Activities CSV export.
- Confirmation of Garmin CSV field names and units.
- Confirmation whether VO2 Max appears in the export.
- Seed fixtures for repeatable acceptance tests.

---

## Risks

### CSV Field Variability

Garmin CSV field names can vary by device, firmware, and user unit settings. This blocks reliable ingestion if not validated early.

**Mitigation:** Validate against a real export before parser implementation, preserve `raw_csv_row`, and keep parser errors visible in upload summaries.

### Unit Ambiguity

Distance and pace may be exported in kilometers or miles depending on Garmin settings.

**Mitigation:** Confirm export units during Milestone 1 and centralize conversion logic in the parser.

### Inconsistent Fitness Calculations

If dashboard and chat derive aerobic efficiency differently, the product may answer the core question inconsistently.

**Mitigation:** Put all metric definitions in pure shared calculation modules and use them for both dashboard and chat context.

### LLM Hallucination

The model may overstate confidence or infer coaching recommendations outside MVP scope.

**Mitigation:** Version the system prompt, inject precomputed stats, test prompt constraints, and require explicit uncertainty when data is sparse.

### Edge Runtime Constraints

The chat route cannot depend on Node-only APIs or packages.

**Mitigation:** Keep `/api/chat` dependencies edge-compatible and isolate Node-specific logic in upload/activity routes.

### Context Growth

Sending all activity history to the model can become slow or costly.

**Mitigation:** Use `ACTIVITY_CONTEXT_MONTHS=12` as the default MVP window and compact context format. Keep the value configurable, then defer query-aware context selection and aggregates to post-MVP.

### Supabase Configuration Drift

Local, test, and production schemas can diverge.

**Mitigation:** Treat migrations as source of truth and run integration tests against controlled test data.

### Over-Scope Pressure

Training plans, coaching, auth, multi-user support, and vector search are tempting adjacent features.

**Mitigation:** Keep acceptance criteria tied to the core question and explicitly reject out-of-scope features in prompt and UI behavior.

---

## File Structure

The repository is documentation-only today. The MVP should add a focused Next.js structure without unrelated scaffolding.

### Root

- `AGENTS.md` - engineering rules and constraints.
- `implementation-plan.md` - this implementation plan.
- `package.json` - scripts and app dependencies.
- `next.config.ts` - Next.js configuration.
- `tsconfig.json` - strict TypeScript configuration.
- `vitest.config.ts` - unit/integration test configuration.
- `playwright.config.ts` - browser acceptance test configuration.
- `.env.example` - required environment variable names.

### App Routes

- `app/page.tsx` - home page composition for dashboard, upload, and chat.
- `app/layout.tsx` - root layout and global metadata.
- `app/globals.css` - Tailwind entry and global styles.
- `app/api/upload/route.ts` - CSV upload endpoint.
- `app/api/activities/route.ts` - activity retrieval endpoint.
- `app/api/chat/route.ts` - Edge Runtime chat streaming endpoint.

### Components

- `components/upload/upload-panel.tsx` - upload entry point and upload state UI.
- `components/upload/file-dropzone.tsx` - drag-and-drop and file picker control.
- `components/dashboard/dashboard.tsx` - dashboard composition.
- `components/dashboard/pace-heart-rate-chart.tsx` - pace/HR trend panel.
- `components/dashboard/efficiency-trend-chart.tsx` - aerobic efficiency trend panel.
- `components/dashboard/vo2-trend-chart.tsx` - VO2 trend panel.
- `components/dashboard/weekly-mileage-chart.tsx` - weekly mileage panel.
- `components/dashboard/recent-runs-table.tsx` - recent activity table.
- `components/chat/chat-panel.tsx` - chat thread, input, and starter prompts.
- `components/chat/message-list.tsx` - chat message rendering.
- `components/chat/chat-input.tsx` - message input and submit control.
- `components/ui/` - small shared UI primitives only when reuse is real.

### Domain and Services

- `lib/activity/types.ts` - canonical activity and API contract types.
- `lib/activity/schema.ts` - Zod schemas for activities, uploads, and route payloads.
- `lib/activity/garmin-parser.ts` - Garmin CSV normalization rules.
- `lib/activity/activity-repository.ts` - Supabase repository methods.
- `lib/activity/serializers.ts` - database-to-API and chat-context serializers.
- `lib/config/env.ts` - Zod-validated server environment including `ACTIVITY_CONTEXT_MONTHS`.
- `lib/calculations/efficiency.ts` - aerobic efficiency and eligibility rules.
- `lib/calculations/weekly-mileage.ts` - weekly distance aggregation.
- `lib/calculations/rolling-average.ts` - rolling window helpers.
- `lib/calculations/dashboard.ts` - chart-specific calculation adapters.
- `lib/llm/types.ts` - provider interface and message types.
- `lib/llm/openai.ts` - OpenAI provider using the Responses API.
- `lib/llm/ollama.ts` - optional local provider.
- `lib/llm/index.ts` - provider factory.
- `lib/llm/prompts.ts` - versioned Aeris system prompt.
- `lib/llm/context.ts` - chat context builder.
- `lib/supabase/client.ts` - Supabase browser client.
- `lib/supabase/server.ts` - Supabase server client.

### Database

- `supabase/migrations/0001_create_activities.sql` - activities table and unique index.
- `supabase/seed.sql` - optional deterministic seed data for local acceptance tests.

### Tests

- `tests/unit/garmin-parser.test.ts` - CSV parsing and field normalization.
- `tests/unit/activity-schema.test.ts` - Zod validation.
- `tests/unit/env-config.test.ts` - environment validation and context-window default behavior.
- `tests/unit/efficiency.test.ts` - aerobic efficiency and eligibility rules.
- `tests/unit/weekly-mileage.test.ts` - weekly mileage aggregation.
- `tests/unit/dashboard-calculations.test.ts` - chart data shaping.
- `tests/unit/prompt-context.test.ts` - chat context and prompt constraints.
- `tests/integration/activity-repository.test.ts` - Supabase repository behavior.
- `tests/integration/upload-route.test.ts` - upload API behavior.
- `tests/integration/activities-route.test.ts` - activities API contract.
- `tests/integration/chat-route.test.ts` - chat API validation and streaming behavior.
- `tests/e2e/upload-dashboard-chat.spec.ts` - primary user journey.
- `tests/acceptance/fitness-trend.spec.ts` - "faster at same heart rate" acceptance scenario.
- `tests/acceptance/monthly-mileage.spec.ts` - April versus March comparison and highest monthly mileage scenarios.
- `tests/acceptance/vo2-trend.spec.ts` - VO2 max trend scenario.
- `tests/acceptance/best-aerobic-run.spec.ts` - best aerobic efficiency run scenario.
- `tests/acceptance/fastest-10k-equivalent.spec.ts` - fastest 10K equivalent scenario.
- `tests/acceptance/overtraining-guardrail.spec.ts` - no-hallucinated-coaching guardrail scenario.
- `tests/acceptance/miles-last-week.spec.ts` - previous-week mileage conversion scenario.

### Documentation

- `docs/prd.md` - MVP product requirements.
- `docs/tech-plan.md` - architecture and technical decisions.
- `docs/acceptance-tests.md` - acceptance scenarios.
- `docs/setup.md` - local setup, Supabase setup, and environment instructions.
- `docs/deployment.md` - Vercel deployment checklist.

---

## Verification Strategy

Every implementation task should preserve this definition of done:

- A failing test exists before production behavior is added.
- The smallest useful implementation makes the test pass.
- Shared logic is refactored only after tests are green.
- Unit tests pass.
- Integration tests pass for touched routes/repositories.
- Playwright passes for touched user flows.
- Type checks pass.
- Production build passes.
- Acceptance criteria remain satisfied.

The final MVP is complete only when the app can ingest real Garmin data, show the required dashboard trends, and answer the documented acceptance questions with data-backed, non-coaching responses.
