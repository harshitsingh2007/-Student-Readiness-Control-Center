# AI COLLABORATION & VERIFICATION LOG (AI_LOG.md)
**Project**: Student Readiness Control Center  
**Assessment**: Infinite Locus Role-Aligned Assessment  

In compliance with the assessment's AI use disclosure policy, this document accurately logs the AI-assisted prompts, accepted contributions, rejected suggestions, corrections made, and verification steps performed throughout development.

---

## Contribution Log Entry #1: Database Schema & Local Cluster Provisioning

- **Tool Used**: Antigravity AI Assistant (Gemini 3.8 Flash High)
- **Prompt**:
  > "Set up PostgreSQL and MongoDB configuration and migrations conforming to the Section 2 and Section 6 relational requirements. Ensure zero-friction local setup on Windows."
- **Output Accepted**:
  - PostgreSQL schema (`database/migrations/001_initial_schema.sql`) with composite primary key `(tenant_id, key)` on `idempotency_records`, version column on `students`, and deterministic index on `attempts(student_id, competency_id, submitted_at DESC, id DESC)`.
  - Transactional `outbox_events` table for reliable MongoDB publishing.
- **Output Rejected**:
  - Initial attempt to initialize database data directory inside `database/pgdata/` within the project root.
  - **Reason for Rejection**: On Windows, the project directory is located inside OneDrive sync (`OneDrive\Apps\Desktop`), which causes Windows file-sharing violations on active database log and WAL files (`could not open file "./server.log": sharing violation`).
- **Correction Made**:
  - Re-routed local database cluster initialization to `C:\Users\HARSHIT SINGH\AppData\Local\student_readiness_pgdata`, completely avoiding OneDrive synchronization lockups.
- **Verification Performed**:
  - Executed `node src/db/setupPostgres.js`, `node src/db/migrate.js`, and `node src/db/seed.js`. Verified database table creation and seed data insertion.

---

## Contribution Log Entry #2: Password Hashing in Seed Data

- **Tool Used**: Antigravity AI Assistant
- **Prompt**:
  > "Seed initial users (admin, evaluator) for Tenant Alpha and Tenant Beta with bcrypt password hashes."
- **Output Accepted**:
  - Seed SQL structure with users for both tenants.
- **Output Rejected**:
  - A pre-generated placeholder bcrypt hash string that failed authentication during login tests.
- **Correction Made**:
  - Generated live bcryptjs hash for `Password123!` with salt rounds 10 (`$2a$10$kLOCPiG4CJSgwRhLMhnOSu4nZl6Ee4MB/yRrUpG6bnps1yTgIc0gW`) and updated `database/seed/seed_data.sql`.
- **Verification Performed**:
  - Tested `POST /api/auth/login` via Supertest. Verified `200 OK` response with valid JWT token.

---

## Contribution Log Entry #3: Concurrency Control & Idempotency Service

- **Tool Used**: Antigravity AI Assistant
- **Prompt**:
  > "Implement attempt creation with transaction boundaries, Idempotency-Key SHA-256 fingerprinting, replay of stored outcome, and row-locking on student."
- **Output Accepted**:
  - `attemptService.js` and `idempotencyService.js` implementing Strategy A (`SELECT FOR UPDATE` on student and idempotency record).
  - SHA-256 hash calculation over normalized body payload.
  - Atomic readiness re-computation inside the same database transaction.
- **Output Rejected**:
  - In `tests/idempotency/idempotency.test.js`, the test attempted to query outbox events filtering by `payload->'metadata'->>'notes'`, which was not included in event metadata.
- **Correction Made**:
  - Updated the test query to check `WHERE payload->>'studentId' = $1 AND (payload->>'attemptId')::text = $2`.
- **Verification Performed**:
  - Executed `jest tests/idempotency/ --runInBand`. Verified all 3 concurrent requests produced exactly 1 attempt and 1 outbox event.

---

## Contribution Log Entry #4: Frontend Request Correctness & Discriminated Union State

- **Tool Used**: Antigravity AI Assistant
- **Prompt**:
  > "Build the React student list and detail components using TypeScript discriminated unions (Part A2), debounced search, AbortController cancellation, out-of-order response discard (Part A1), and tenant switcher data isolation."
- **Output Accepted**:
  - `useStudents.ts` with 300ms debounce, AbortController cancellation on keystrokes/tenant switch, and sequence counter to ignore out-of-order responses.
  - `StudentPage.tsx` using discriminated union state (`idle`, `loading`, `success`, `refreshing`, `error`, `conflict`), preserving previous data during background refresh failure.
- **Output Rejected**:
  - In `src/components/StudentFilters.tsx`, raw `>=` character in JSX triggered a TypeScript compile error (`TS1382: Did you mean &gt;?`).
  - In `src/components/StudentDetails.tsx`, strict `err instanceof ApiError` check caused mocked test error objects to fall through to `alert()`.
- **Correction Made**:
  - Escaped `>=` to `&gt;=` in JSX option tags.
  - Made conflict error check resilient: `(err instanceof ApiError && err.statusCode === 409) || err?.code === 'VERSION_CONFLICT' || err?.statusCode === 409`.
  - Instantiated real `ApiError` in Vitest unit test.
- **Verification Performed**:
  - Ran `npm --prefix frontend run build` (passed with zero errors).
  - Ran `npm --prefix frontend test` (3 tests passed in Vitest).

---

## Contribution Log Entry #5: Atomic Concurrency Redesign, Zero Hardcoded Passwords, and Competency Extensibility

- **Tool Used**: Antigravity AI Assistant
- **Prompt**:
  > "Redesign idempotency using atomic INSERT ... ON CONFLICT, make competencies configurable with required/code columns, remove hard-coded passwords from React, preserve previousData on refresh failure in Dashboard, and verify all assessment requirements."
- **Output Accepted**:
  - `idempotencyService.js`: Replaced `SELECT ... FOR UPDATE` with atomic `INSERT ... ON CONFLICT (tenant_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING ...`. Concurrent requests wait on the tuple lock, and replayed requests receive the stored response without racing on non-existent rows.
  - `competencies`: Added `required` (BOOLEAN NOT NULL DEFAULT TRUE) and `code` columns. Updated `readinessService.js` and `a4ScoringQuery.js` so optional competencies (where `required = false`) do not force `INCOMPLETE` when missing.
  - `authController.js`: Added `POST /api/auth/switch-tenant` and `POST /api/auth/demo-login`.
  - `Login.tsx` & `App.tsx`: Removed all hardcoded `Password123!` strings from React source code. Password field initializes empty, and tenant switching uses authenticated server-side session exchange.
  - `Dashboard.tsx`: Fixed `activeData` fallback so background refresh failure preserves `state.previousData` alongside the error banner.
- **Output Rejected**:
  - Initial attempt in `computeReadinessFromAttempts` to include optional missing competencies in the denominator caused score dilution on optional electives.
- **Correction Made**:
  - Corrected `totalWeight` summation in `readinessService.js` to only accumulate weights for required competencies and attempted optional competencies.
- **Verification Performed**:
  - `npm --prefix backend test`: 28/28 tests passed.
  - `npm --prefix frontend test`: 4/4 tests passed.
  - `npm --prefix frontend run build`: Clean compilation in <1s with zero errors.

---

## Contribution Log Entry #6: Dynamic "Add New Student" Workflow

- **Tool Used**: Antigravity AI Assistant
- **Prompt**:
  > "Add a complete dynamic 'Add New Student' workflow allowing evaluators/admins to create student records in their tenant. Preserve A1-A5 requirements, seed data, and tenant isolation."
- **Output Accepted**:
  - `POST /api/students` endpoint in `studentController.js` and `students.js`.
  - Enforced server-derived `tenant_id` from JWT session.
  - PostgreSQL unique constraint mapped to `409 Conflict` (`DUPLICATE_STUDENT_EMAIL`).
  - Transactional outbox event `student.created` emitted to MongoDB.
  - `AddStudentModal.tsx` component with accessible form validation and double-click prevention.
  - Dynamic table refresh without page reload.
- **Output Rejected**:
  - Initial suggestion to accept `tenantId` in the request body was rejected as a tenant boundary violation.
- **Correction Made**:
  - Enforced `tenantId` strictly from `req.tenantId` in the backend controller.
- **Verification Performed**:
  - 8 new integration and unit tests added.
  - Backend tests: 36/36 passed. Frontend tests: 8/8 passed.

---

## Contribution Log Entry #7: Modern Academic SaaS Dashboard Redesign

- **Tool Used**: Antigravity AI Assistant
- **Prompt**:
  > "Redesign the frontend UI to look and feel like a professionally designed, human-made academic SaaS/admin dashboard rather than an AI-generated interface. Use light theme, crisp typography, clean left sidebar, top header, dynamic date, and 4 dynamically calculated summary KPI cards."
- **Output Accepted**:
  - `Sidebar.tsx`: Professional left navigation with brand logo, 7 menu links, active page highlights, and bottom motivational support card.
  - `Navbar.tsx`: Top header with tenant selector, notifications bell, user initials avatar, role badge, and Sign Out button.
  - `Dashboard.tsx`: "Welcome Back!" heading, localized dynamic date card, and 4 dynamic summary KPI cards (Total Students, Ready, Developing, At Risk).
  - `StudentTable.tsx`: Added student initials avatar badges and clean status dot badges (`● Ready`, `● Developing`, `● Needs Prep`, `● Incomplete`).
  - `CompetencyTable.tsx`: Visual score progress bars (`progress-high`, `progress-med`, `progress-low`).
  - `StudentDetails.tsx`: Student avatar header and clean score breakdown.
  - `index.css`: Complete light SaaS design system with off-white background (`#f8fafc`), white card surfaces (`#ffffff`), slate typography, and corporate royal blue accents (`#2563eb`).
- **Output Rejected**:
  - Initial draft considered hardcoded KPI counts; rejected to preserve dynamic calculation from real authoritative data.
- **Verification Performed**:
  - Frontend test suite: 8/8 tests passed.
  - Frontend build: Clean build with 0 TypeScript/Vite errors.
  - Backend test suite: 36/36 tests passed.

---

## Contribution Log Entry #8: Interactive Sidebar Views & Complete Navigation Router

- **Tool Used**: Antigravity AI Assistant
- **Prompt**:
  > "Everything is ok but in the sidebar button is not working i think it just for the display but i want everything working."
- **Output Accepted**:
  - `AnalyticsView.tsx`: Real-time 24h operational event aggregation, latency percentiles, validation failure rates, and duplicate anomaly detection from MongoDB.
  - `AssessmentsView.tsx`: Full competency assessment framework breakdown, 4 core competency weights (Frontend 30%, Backend 30%, Databases 25%, Problem Solving 15%), readiness threshold rules, and deterministic tie-breaking policy.
  - `ReportsView.tsx`: Cohort readiness distribution analytics, percentage completion visual breakdown bar, A4 scoring drift audit, and print/export report feature.
  - `OrganizationView.tsx`: Multi-tenant organization profile, tenant switcher, authorized staff directory, and non-disclosing 404 security architecture.
  - `SettingsView.tsx`: System settings, storage engine health (PostgreSQL 18 & MongoDB), background outbox relay status, and evaluator session details.
  - `Dashboard.tsx`: Added `viewMode="students"` support for dedicated student directory and roster management.
  - `App.tsx`: Wired active tab router dynamically rendering each dedicated view upon sidebar click and clearing stale student selections.
- **Verification Performed**:
  - Frontend test suite: 8/8 passed.
  - Frontend build: Clean build with 0 TypeScript/Vite errors.
  - Backend test suite: 36/36 passed.

---

## Summary of Verification Evidence
- Domain Unit Tests: 14/14 passed.
- API Integration Tests: 18/18 passed.
- Idempotency & Concurrency Tests: 3/3 passed (all 3 concurrent identical requests succeed).
- MongoDB Failure Injection Tests: 1/1 passed.
- Frontend Resilience Tests: 8/8 passed (out-of-order discard, tenant switch abort, 409 conflict UI, refresh error data preservation, AddStudentModal validation).
- Total Tests: 44/44 passed across all test suites.

