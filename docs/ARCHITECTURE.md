# SYSTEM ARCHITECTURE DOCUMENTATION
**Project**: Student Readiness Control Center  
**Repository**: `student-readiness-control-center`  

---

## 1. High-Level System Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REACT FRONTEND (Vite / Port 5175)               │
│  - Discriminated Union Async State Model                               │
│  - URL-Persisted Query State (useSearchParams)                         │
│  - AbortController Request Cancellation on Keystrokes/Switch           │
│  - Stale Response Sequence Guard                                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST (JWT, Idempotency-Key)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       EXPRESS BACKEND (Port 5002)                      │
│  - Authentication & RBAC (authenticate, requireRole)                   │
│  - Tenant Isolation Guard (strips untrusted client inputs)             │
│  - Input Validation & Parameter Allowlisting                           │
│  - Global Error Contract Formatter                                     │
│  - Background Outbox Publisher Worker (5s loop)                        │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    │ ACID Transactions              │ Asynchronous Flush
                    │ (Source of Truth)              │ (Append-Only Events)
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│        POSTGRESQL (Port 5433)        │  │     MONGODB (Port 27017)     │
│  - tenants, users, students          │  │  - activity_events           │
│  - competencies (data-driven)        │  │    (attempt.succeeded,       │
│  - attempts (tie-breaker indexes)    │  │     attempt.rejected)        │
│  - idempotency_records (SHA-256)     │  │  - Unique index on eventId   │
│  - outbox_events (pending queue)     │  │  - 24h Aggregation Pipeline │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## 2. Multi-Tenant Isolation Model

1. **Client Trust Boundary**:
   - The browser is considered an untrusted client environment.
   - Any client-supplied parameters such as `req.body.tenantId`, `req.query.tenantId`, `req.body.role`, or `req.body.evaluatorId` are explicitly stripped and rejected by the `tenantGuard` middleware.
2. **Authoritative Context**:
   - Every request is authenticated via signed JWT. The verified JWT payload injects `req.user = { userId, tenantId, role }`.
3. **Database Scoping**:
   - Every SQL query enforces `WHERE tenant_id = $1` using parameterized inputs.
4. **Non-Disclosing Information Invariant**:
   - When a tenant queries a student or attempt that does not exist OR belongs to another tenant, the system strictly returns a generic `404 Not Found`. It never reveals whether the ID exists in another tenant.

---

## 3. Concurrency & Transaction Strategy

### Strategy Selection: Pessimistic Row-Locking (Strategy A)
To prevent race conditions where concurrent submissions overwrite student readiness with stale aggregates:
1. **Pessimistic Row Lock**:
   ```sql
   SELECT id, version FROM students WHERE id = $1 AND tenant_id = $2 FOR UPDATE;
   ```
   Locks the specific student row in PostgreSQL until the transaction commits.
2. **Idempotency Protection**:
   `idempotency_records` table enforces a composite primary key `(tenant_id, key)`. A concurrent request locking this key detects the `IN_PROGRESS` or `COMPLETED` state and safely yields or replays.
3. **Optimistic Concurrency on Updates**:
   Direct profile updates (`PATCH /api/students/:id`) use optimistic version checks (`expectedVersion`). If another client modified the student in between, the query updates 0 rows and returns `409 Conflict` with `currentVersion`.

---

## 4. Dual-Store Reliability: Transactional Outbox Pattern

To prevent distributed failure between PostgreSQL (source of truth) and MongoDB (operational audit):
- **Problem**: Direct two-phase commits between SQL and NoSQL are slow, brittle, and create distributed rollback hazards. Swallowing MongoDB errors loses audit history.
- **Solution**:
  1. The business record (`attempts`) and the operational event (`outbox_events`) are inserted in the **exact same PostgreSQL ACID transaction**.
  2. If the PostgreSQL transaction fails, zero rows and zero events are created.
  3. A dedicated asynchronous outbox worker flushes pending events from PostgreSQL to MongoDB.
  4. MongoDB enforces a unique index on `eventId`. If the outbox worker retries, MongoDB deduplicates the insert, preventing duplicate success events.

---

## 5. Seeded Defect Resolution (Tenant Switching Race Condition)

The starter problem exhibited data leakage from previous tenants when switching accounts quickly. We resolved this at all five affected trust boundaries:

| Boundary | Correction Implemented |
| :--- | :--- |
| **1. Auth Context** | Swaps JWT token and updates authenticated identity immediately. |
| **2. React State** | Clears active student detail, resets list state to `idle`, and resets page to 1. |
| **3. Request Cancellation** | `AbortController` aborts all pending in-flight requests for the previous tenant. |
| **4. Stale Response Guard** | Sequence counter and tenant identity check discard responses from superseded requests. |
| **5. Database Scoping** | PostgreSQL queries filter strictly by `WHERE tenant_id = req.user.tenantId`. |
