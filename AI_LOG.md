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

## Summary of Verification Evidence
- Domain Unit Tests: 13/13 passed.
- API Integration Tests: 11/11 passed.
- Idempotency & Concurrency Tests: 3/3 passed.
- MongoDB Failure Injection Tests: 1/1 passed.
- Frontend Resilience Tests: 3/3 passed.
- Total Tests: 31/31 passed across all test suites.
