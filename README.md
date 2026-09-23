# Student Readiness Control Center

[![Backend Tests](https://img.shields.io/badge/backend_tests-47%2F47_passed-brightgreen.svg)]()
[![Frontend Tests](https://img.shields.io/badge/frontend_tests-8%2F8_passed-brightgreen.svg)]()
[![Node](https://img.shields.io/badge/node->=18.0.0-blue.svg)]()
[![React](https://img.shields.io/badge/react-18.3.1-blue.svg)]()
[![TypeScript](https://img.shields.io/badge/typescript-5.4.5-blue.svg)]()

> A production-grade, multi-tenant evaluation and operational monitoring platform. Built as ONE coherent application satisfying Parts A, B, C, and D of the Infinite Locus Full-Stack Developer Readiness Assessment.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Folder Structure](#3-folder-structure)
4. [Prerequisites](#4-prerequisites)
5. [Database Setup (PostgreSQL & MongoDB)](#5-database-setup)
6. [Environment Variables](#6-environment-variables)
7. [Installation & Setup](#7-installation--setup)
8. [Running the Application](#8-running-the-application)
9. [Automated Test Suite](#9-automated-test-suite)
10. [Live Defense & Demonstrations](#10-live-defense--demonstrations)
11. [How Parts A, B, C, and D Map to This Project](#11-how-parts-a-d-map-to-this-project)
12. [Verification Checklist](#12-verification-checklist)

---

## 1. Project Overview

Training organizations use the **Student Readiness Control Center** to:
- Manage students across strictly isolated organizations (tenants).
- Record competency assessment attempts with automatic `Idempotency-Key` deduplication.
- Calculate student readiness authoritatively on the server using data-driven competencies and deterministic tie-breaking.
- Prevent duplicate submissions and concurrent race condition corruption.
- Maintain an append-only operational audit trail in MongoDB backed by a resilient transactional outbox in PostgreSQL.
- Detect operational anomalies such as duplicate success events and validation failure spikes.

### Core Business Rules & Competencies
The system initially defines four required competencies (data-driven in PostgreSQL):
1. **Frontend Development**: 30% weight
2. **Backend Engineering**: 30% weight
3. **Database Systems**: 25% weight
4. **Problem Solving & Logic**: 15% weight

- **Authoritative Score**: Weighted mean of the latest non-voided attempt for each required competency.
- **Deterministic Tie-Breaking**: If two attempts share an identical `submitted_at` timestamp, the attempt with the **higher attempt ID wins**.
- **Incomplete Rule**: If any required competency has no valid attempt, readiness status is strictly **`INCOMPLETE`**.
- **Readiness Thresholds**:
  - Score $\ge 80.00$: **`READY`**
  - $65.00 \le \text{Score} < 80.00$: **`NEARLY_READY`**
  - $50.00 \le \text{Score} < 65.00$: **`DEVELOPING`**
  - $\text{Score} < 50.00$: **`NEEDS_PREPARATION`**

---

## 2. Architecture Diagram

```
                                 [ Browser / Client ]
                                           │
                         React + TypeScript (Port 5175)
                         • URL Query Persistence (?search=...&page=...)
                         • 300ms Debounced Search
                         • AbortController Request Cancellation
                         • Out-of-Order Sequence Discard Guard
                         • Discriminated Union Async State Model
                                           │
                                  REST API (JSON / JWT)
                                           │
                                           ▼
                             [ Express.js Backend (Port 5002) ]
                             • JWT Auth & RBAC (ADMIN, EVALUATOR)
                             • Multi-Tenant Isolation Middleware
                             • Parameter Allowlisting (No Mass Assignment)
                             • Global Error Envelope { code, message, requestId }
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    │ ACID Transactions                           │ Async Outbox Flush
                    ▼                                             ▼
       [ PostgreSQL (Port 5433) ]                      [ MongoDB (Port 27017) ]
       • Source of Truth                               • Append-Only Audit Log
       • tenants, users, students                      • activity_events collection
       • competencies (data-driven)                    • Unique eventId index
       • attempts (tie-breaker index)                  • 24h Anomaly Aggregation
       • idempotency_records (SHA-256)
       • outbox_events (transactional queue)
```

---

## 3. Folder Structure

```
student-readiness-control-center/
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── components/        # Navbar, TenantSelector, StudentTable, AttemptForm, etc.
│       ├── pages/             # Login, Dashboard, StudentPage
│       ├── services/          # api.ts, studentApi.ts, attemptApi.ts
│       ├── hooks/             # useStudents.ts, useAbortableRequest.ts
│       ├── types/             # student.ts, attempt.ts, api.ts
│       ├── utils/             # urlState.ts, validation.ts
│       ├── tests/             # frontendResilience.test.tsx
│       ├── App.tsx
│       ├── main.tsx
│       └── index.css
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── config/            # postgres.js, mongodb.js
│   │   ├── middleware/        # auth.js, tenant.js, validation.js, errorHandler.js
│   │   ├── controllers/       # studentController.js, attemptController.js, activityController.js
│   │   ├── services/          # readinessService.js, attemptService.js, idempotencyService.js, eventPublisher.js
│   │   ├── routes/            # students.js, activity.js, auth.js
│   │   ├── db/                # setupPostgres.js, migrate.js, seed.js, queries/a4ScoringQuery.js
│   │   ├── app.js
│   │   └── server.js
│   └── tests/
│       ├── domain/            # readinessService.test.js
│       ├── integration/       # api.test.js, failureInjection.test.js
│       └── idempotency/       # idempotency.test.js
├── database/
│   ├── migrations/            # 001_initial_schema.sql
│   └── seed/                  # seed_data.sql
├── docs/
│   ├── ARCHITECTURE.md        # Deep architectural design & data flow
│   ├── API.md                 # Complete API schemas and contracts
│   └── DEFENSE_GUIDE.md       # Live defense script and live change instructions
├── README.md                  # System overview and quickstart
├── DECISIONS.md               # Architecture trade-offs & deferred improvements
├── AI_LOG.md                  # Disclosure of AI assistance & verification
├── INCIDENT.md                # Part C production incident investigation
└── PULL_REQUEST.md            # Production-grade pull request description
```

---

## 4. Prerequisites

- **Node.js**: `v18.0.0` or higher (verified on `v22.21.0`)
- **npm**: `v9.0.0` or higher
- **PostgreSQL**: PostgreSQL 14+ installed (local cluster auto-provisioned on port 5433)
- **MongoDB**: Running locally on `mongodb://127.0.0.1:27017`

---

## 5. Database Setup

### 1. PostgreSQL (Port 5433)
The backend includes an automated setup utility (`backend/src/db/setupPostgres.js`) that provisions a dedicated local cluster in `AppData/Local/student_readiness_pgdata` on port 5433 with trust authentication:
```bash
cd backend
node src/db/setupPostgres.js
```

### 2. Run Database Migrations
Applies the schema defined in `database/migrations/001_initial_schema.sql`:
```bash
npm run db:migrate
```

### 3. Seed Realistic Multi-Tenant Data
Populates tenants, users, data-driven competencies, and students with all readiness states:
```bash
npm run db:seed
```

---

## 6. Environment Variables

Create `.env` in `backend/` (or copy from `backend/.env.example`):
```env
PORT=5002
NODE_ENV=development
CORS_ORIGIN=http://localhost:5175

PGHOST=localhost
PGPORT=5433
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=student_readiness

MONGODB_URI=mongodb://127.0.0.1:27017/student_readiness_operational

JWT_SECRET=super_secret_production_ready_jwt_key_32chars_long
JWT_EXPIRES_IN=24h
IDEMPOTENCY_TTL_HOURS=24
```

---

## 7. Installation & Setup

Install root, backend, and frontend dependencies:
```bash
npm run install:all
```

---

## 8. Running the Application

### Start the Backend (Port 5002)
```bash
cd backend
npm run dev
```

### Start the Frontend (Port 5175)
```bash
cd frontend
npm run dev
```
Open **`http://localhost:5175`** in your browser.

### Seeded Demo Credentials
| Organization | Role | Email | Password |
| :--- | :--- | :--- | :--- |
| **Alpha Technical Institute** | Evaluator | `evaluator@alpha.com` | `Password123!` |
| **Alpha Technical Institute** | Admin | `admin@alpha.com` | `Password123!` |
| **Beta Global Academy** | Evaluator | `evaluator@beta.com` | `Password123!` |
| **Beta Global Academy** | Admin | `admin@beta.com` | `Password123!` |

*(The login screen also includes convenient 1-click login buttons for all roles)*

---

## 9. Automated Test Suite
 
### Run All Backend Tests (47 Tests Across 5 Suites)
```bash
cd backend
npm test
```
Tests executed:
- `tests/integration/compliance.test.js`: Full specification compliance verifying A5 concurrent different-key row lock serialization, A6 operational latency tracking in MongoDB, A6 validation failure event logging (`attempt.rejected`), A6 true p95 latency calculation, A6 duplicate-success anomaly detection, A6 tenant analytics isolation, A7 production demo-login 404 gate, A7 production unauthorized tenant switching 403 gate, A7 fail-fast missing `JWT_SECRET` exception, and Phase 5 dynamic competencies endpoint `GET /api/competencies` (10 tests).
- `tests/domain/readinessService.test.js`: Domain boundary thresholds, tie-breaking, missing required vs. optional competencies, mathematical invariants (14 tests).
- `tests/integration/api.test.js`: Authentication, authorization, tenant isolation, non-disclosing 404, optimistic concurrency, and dynamic student creation (18 tests).
- `tests/idempotency/idempotency.test.js`: 3 parallel identical requests producing 1 attempt, stored replay, fingerprint mismatch rejection (3 tests).
- `tests/integration/failureInjection.test.js`: Simulated MongoDB outage, outbox persistence, and recovery flushing without duplicate events (2 tests).

### Run Frontend Resilience & Component Tests (8 Tests)
```bash
cd frontend
npm test
```
Tests executed:
- `frontendResilience.test.tsx`: Out-of-order response discard, `AbortController` cancellation on fast tenant switch, 409 Conflict UI rendering, background refresh data preservation, and `AddStudentModal` validation/submission (8 tests).

---

## 10. Live Defense & Demonstrations

Refer to **[`docs/DEFENSE_GUIDE.md`](file:///c:/Users/HARSHIT%20SINGH/OneDrive/Apps/Desktop/Infinite-locus/docs/DEFENSE_GUIDE.md)** for detailed evaluation scripts.

### 1. Demonstrate Parallel Idempotency
Send two simultaneous requests with the same `Idempotency-Key`:
```bash
curl -X POST "http://localhost:5002/api/students/student-alpha-3/attempts" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: test-key-999" \
  -H "Content-Type: application/json" \
  -d '{"competencyKey":"frontend","score":90}' &
curl -X POST "http://localhost:5002/api/students/student-alpha-3/attempts" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Idempotency-Key: test-key-999" \
  -H "Content-Type: application/json" \
  -d '{"competencyKey":"frontend","score":90}' &
wait
```
**Outcome**: Exactly one attempt is committed to PostgreSQL and exactly one event is generated in MongoDB; the second request returns `X-Idempotency-Replay: true`.

### 2. Demonstrate Cross-Tenant Denial
Attempting to view a Tenant Beta student while logged in as Tenant Alpha:
```bash
curl -i -X GET "http://localhost:5002/api/students/student-beta-1" \
  -H "Authorization: Bearer <ALPHA_TOKEN>"
```
**Outcome**: Returns `404 Not Found` with zero indication that `student-beta-1` exists.

---

## 11. How Parts A–D Map to This Project

```
                         ONE APPLICATION
                                │
                 Student Readiness Control Center
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
     PART A                  PART B                  PART C
Advanced Engineering     Production Build        Incident Investigation
     Reasoning            Full-Stack Slice          (INCIDENT.md)
  (A1-A9 Solutions)      (React, Node, SQL, Mongo)      │
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                                ▼
                             PART D
                          Live Defense
                      (docs/DEFENSE_GUIDE.md)
```

- **A1**: React request correctness (`useStudents.ts`, `useAbortableRequest.ts`).
- **A2**: TypeScript discriminated unions (`StudentAsyncState` in `types/student.ts`, `StudentPage.tsx`).
- **A3**: Idempotency and optimistic concurrency (`idempotencyService.js`, `PATCH /api/students/:id`).
- **A4**: SQL latest evidence, ties, and weighting (`backend/src/db/queries/a4ScoringQuery.js`).
- **A5**: Transactional race condition handling (Strategy A: `SELECT FOR UPDATE` in `attemptService.js`).
- **A6**: MongoDB aggregation & anomaly detection (`activityController.js`).
- **A7**: Security review & allowlisting (`validation.js`, `tenant.js`).
- **A8**: Automated testing strategy (`backend/tests/`, `frontend/src/tests/`).
- **A9**: Git recovery & AI verification (`AI_LOG.md`).

---

## 12. Verification Checklist

- [x] Backend runs on port 5002 (`npm run dev:backend`)
- [x] Frontend runs on port 5175 (`npm run dev:frontend`)
- [x] PostgreSQL relational schema, migrations, and seed data verified
- [x] MongoDB append-only operational events and 24h aggregation pipeline verified
- [x] Authoritative server-side readiness calculation verified
- [x] Deterministic tie-breaking (equal timestamps -> higher attempt ID wins) verified
- [x] Missing competency strictly results in `INCOMPLETE` status verified
- [x] Multi-tenant isolation verified with non-disclosing 404 behavior
- [x] Idempotency SHA-256 fingerprinting and parallel race condition protection verified
- [x] Optimistic concurrency control (`expectedVersion`) returning 409 Conflict verified
- [x] Transactional outbox resilience during simulated MongoDB outage verified
- [x] React URL-persisted search, filters, pagination, and debounce verified
- [x] Seeded defect (cross-tenant leakage on fast account switch) resolved across all trust boundaries
- [x] All 36 backend tests and 8 frontend tests pass with zero failures
- [x] `INCIDENT.md`, `DECISIONS.md`, `AI_LOG.md`, `PULL_REQUEST.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, and `docs/DEFENSE_GUIDE.md` complete
