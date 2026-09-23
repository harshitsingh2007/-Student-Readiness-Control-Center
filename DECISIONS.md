# ARCHITECTURE DECISION RECORDS (ADR)
**Project**: Student Readiness Control Center  

---

## Decision 1: PostgreSQL as Relational Source of Truth vs MongoDB as Operational Event Store

### Context
The application requires high-integrity multi-tenant student evaluation records, authoritative score re-computation, and high-volume append-only audit tracking.

### Decision
Use PostgreSQL as the sole ACID-compliant relational source of truth (tenants, users, students, competencies, attempts, idempotency records). Use MongoDB strictly as an append-only operational activity log.

### Trade-offs & Analysis
- **Positives**:
  - Eliminates eventual consistency hazards on student readiness scores.
  - Enables atomic transactions spanning attempt creation, score recalculation, and outbox event queuing.
  - Allows window queries (`ROW_NUMBER() OVER`) for authoritative database-side tie-breaking and score calculation.
- **Negatives**:
  - Requires maintaining two database connections and operational schemas.
- **Mitigation**:
  - Connected via the Transactional Outbox pattern so the system is fully resilient even during MongoDB outages.

---

## Decision 2: Idempotency Strategy via SHA-256 Fingerprinting and Atomic `INSERT ... ON CONFLICT` Concurrency Locking

### Context
Network retries, double-clicks, and mobile reconnections can resend duplicate attempt submissions. Reused keys with different payloads must be rejected, while identical requests must replay the stored response.
Crucially, a simple `SELECT ... FOR UPDATE` does **not** safely lock a non-existent idempotency record in PostgreSQL: when a row does not yet exist, `SELECT FOR UPDATE` returns 0 rows without acquiring a row-level lock. If 3 concurrent requests arrive simultaneously, all three see 0 rows and race to `INSERT`, causing unhandled unique constraint violations or duplicate writes.

### Decision
Enforce composite uniqueness `PRIMARY KEY (tenant_id, key)` on `idempotency_records`. Redesign the acquisition flow using PostgreSQL atomic statement:
```sql
INSERT INTO idempotency_records (tenant_id, key, request_fingerprint, status, expires_at)
VALUES ($1, $2, $3, 'IN_PROGRESS', $4)
ON CONFLICT (tenant_id, key) DO UPDATE
SET key = EXCLUDED.key
RETURNING status, request_fingerprint, response_status_code, response_body, (xmax = 0) AS is_new;
```

### Concurrency Mechanics & Invariants
1. **Serialization via Lock-Wait**: When multiple concurrent requests arrive with the same `(tenant_id, key)`, the primary request inserts the row (`is_new = true`). PostgreSQL places subsequent concurrent transactions into an automatic lock-wait state on that tuple until the primary transaction COMMITS or ROLLS BACK.
2. **Replay on Commit**: When the primary transaction commits with `status = 'COMPLETED'` and the serialized response payload, waiting transactions wake up, execute the `ON CONFLICT` clause against the committed tuple, detect matching SHA-256 fingerprints, and return the replayed response with `X-Idempotency-Replay: true`.
3. **Rollback Resilience**: If the primary transaction encounters an error and rolls back, the waiting transaction's `INSERT` executes (`is_new = true`), seamlessly taking over execution without dropped submissions.
4. **Tampering Detection**: If a request attempts to reuse the key with a modified payload, the SHA-256 fingerprint differs, immediately triggering a `422 Unprocessable Entity` rejection.

### Trade-offs & Analysis
- **Positives**:
  - Eliminates unhandled PostgreSQL unique constraint race conditions.
  - Guarantees exactly ONE attempt created and exactly ONE outbox event produced across concurrent retries.
  - Replays original stored response (`status_code` and `response_body`) with `X-Idempotency-Replay: true`.
- **Negatives**:
  - Concurrent requests with the same key wait for the primary transaction to commit (~15-30ms).
- **Justification**:
  - Assessment integrity demands strict idempotency guarantees over sub-millisecond concurrency shortcuts.

---

## Decision 3: Optimistic Concurrency Control (`expectedVersion`) for Entity Updates

### Context
Multiple evaluators or administrators may view and edit the same student profile simultaneously. A blind `UPDATE` would cause the "lost update" anomaly.

### Decision
Include an integer `version` field on the `students` table. Mutation requests (`PATCH /api/students/:id`) must supply `expectedVersion`. The update query checks `WHERE id = $1 AND tenant_id = $2 AND version = $expectedVersion` and increments `version = version + 1`. If zero rows are updated, the server inspects the record and returns `409 Conflict` with `currentVersion`.

### Trade-offs & Analysis
- **Positives**:
  - Lock-free: Does not block read operations.
  - Safe: Guarantee that no partial updates occur on conflict.
  - Client-friendly: React UI displays current version and reload button.
- **Negatives**:
  - Requires clients to track and provide the version on every mutation.

---

## Decision 4: Transactional Outbox vs Direct Dual-Writes to MongoDB

### Context
Publishing operational events to MongoDB after writing to PostgreSQL introduces the dual-write problem. If MongoDB times out, should PostgreSQL roll back?

### Decision
Use the Transactional Outbox pattern. Events are inserted into an `outbox_events` table within the same PostgreSQL transaction as the attempt write. A background publisher worker flushes pending events to MongoDB. MongoDB enforces a unique index on `eventId`.

### Trade-offs & Analysis
- **Positives**:
  - PostgreSQL transaction never fails due to transient MongoDB issues.
  - MongoDB unique index guarantees that outbox retries never produce duplicate logical success events.
- **Negatives**:
  - Adds a few milliseconds of eventual consistency to the MongoDB audit log.

---

## Architectural Decision 5: Row-Level `SELECT ... FOR UPDATE` for Concurrent Non-Identical Submissions (A5)

### Context
When two evaluators concurrently submit different competency attempts (or different scores with distinct `Idempotency-Key`s) for the same student, naive concurrent transactions can read identical initial states, commit conflicting attempts, and overwrite the student's `version` or calculate readiness out-of-order.

### Decision
Acquire an exclusive row-level lock on the student row at the beginning of the attempt transaction:
```sql
SELECT id, tenant_id, name, version FROM students WHERE id = $1 AND tenant_id = $2 FOR UPDATE;
```
This forces concurrent transactions for the same student to queue sequentially. The second transaction unblocks only after the first commits, reading the updated student state, inserting its attempt, recalculating readiness on all valid non-void attempts, and incrementing version from $V+1$ to $V+2$.

### Trade-offs & Analysis
- **Positives**:
  - Completely eliminates lost updates and race condition readiness drift.
  - Zero chance of stale version overwrites.
- **Negatives**:
  - Adds a small lock serialization delay (typically <50ms) only when submissions target the exact same student concurrently.

---

## Architectural Decision 6: Append-Only Operational Anomaly Pipeline with Nullable p95 Percentile (A6)

### Context
Operational monitoring requires aggregating latency percentiles, tracking validation rejections, and identifying duplicate success event anomalies over 24 hours in MongoDB without impacting PostgreSQL transactional throughput.

### Decision
1. Measure actual submission latency with high-resolution `performance.now()` in `attemptService.js` and store in event `metadata.latencyMs`.
2. Record attempt validation rejections as `attempt.rejected` events with `reason: 'VALIDATION_ERROR'` and `metadata.validationFailure: true`.
3. Compute the true 95th percentile using MongoDB aggregation, returning `null` (not an arbitrary constant) when zero successful submissions have been observed.
4. Detect duplicate success event anomalies by grouping MongoDB events by `idempotencyKey` / `attemptId` and filtering for `count > 1`.

### Trade-offs & Analysis
- **Positives**:
  - True observability into pipeline latency and failure rates.
  - Returns honest null states rather than fabricated numbers.
- **Negatives**:
  - Requires MongoDB aggregation pipelines to process event history.

---

## Architectural Decision 7: Runtime Client Schema Validation Boundary (Phase 7)

### Context
TypeScript types only exist at compile time. In production, unvalidated server JSON payloads could drift, missing required fields or containing corrupt shapes that crash UI rendering silently.

### Decision
Introduce typed schema validation predicates (`isStudentSummary`, `isStudentDetail`, `isAssessmentAttemptResponse`, `isAnalyticsSummary`) executed inside `apiClient` before React state update. If an HTTP response does not conform to the expected client contract, throw a structured `ApiError(502, 'INVALID_RESPONSE_SCHEMA')`.

### Trade-offs & Analysis
- **Positives**:
  - Prevents subtle runtime crashes and state corruption.
  - Surfaces API contract violations immediately with actionable diagnostics.
- **Negatives**:
  - Adds a negligible microsecond CPU overhead during JSON parsing.

---

## Architectural Decision 8: Outbox Persistence for Validation Rejections & Admin-Only Multi-Tenant Analytics (A6 & Phase 7)

### Context
1. When invalid assessment requests fail (e.g., missing idempotency key, invalid score, missing student), writing rejections directly to MongoDB creates data loss risk if MongoDB is temporarily partitioned or offline.
2. Analytics for a single tenant must strictly prevent cross-tenant disclosure, but platform operators require an aggregate view across all tenants.

### Decision
1. **Outbox-Backed Rejections**: `recordRejectedEvent` writes validation rejection events to the PostgreSQL `outbox_events` table as `PENDING` within an isolated transaction before attempting MongoDB ingestion. If MongoDB is down, the rejected audit record remains durable in PostgreSQL and automatically flushes when connectivity recovers.
2. **Admin-Only Cross-Tenant Analytics**: Implemented `GET /api/analytics/activity-summary/all-tenants` protected with `requireRole(['ADMIN'])`. The endpoint uses MongoDB `$group: { _id: "$tenantId" }` with the native `$percentile` accumulator, returning an array of per-tenant metrics. Evaluators and ordinary users receive `403 Forbidden` if they attempt access.

### Trade-offs & Analysis
- **Positives**:
  - Zero audit event loss for rejections even under total MongoDB outage.
  - Strict tenant isolation preserved for standard tenant routes, with controlled administrative multi-tenant visibility.
- **Negatives**:
  - Slightly higher PostgreSQL write load during rejected request spikes, mitigated by lightweight outbox table indexing.

---

## Consciously Deferred Improvement: Change Data Capture (Debezium/Kafka) Outbox Streaming

### Deferred Feature
Replacing the periodic polling outbox worker (5-second polling interval) with real-time log-based Change Data Capture (e.g. Debezium via PostgreSQL WAL streaming into Apache Kafka).

### Justification for Deferral
- CDC and Kafka introduce massive infrastructure complexity (Zookeeper/KRaft, Kafka brokers, Kafka Connect, Debezium plugins).
- For the operational volume of training organizations and evaluation centers, transactional outbox polling provides 100% data reliability, zero message loss, and sub-5-second latency while remaining completely lightweight, beginner-friendly, and runnable locally with zero external cloud dependencies.
