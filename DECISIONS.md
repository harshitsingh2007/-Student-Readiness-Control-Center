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

## Consciously Deferred Improvement: Change Data Capture (Debezium/Kafka) Outbox Streaming

### Deferred Feature
Replacing the periodic polling outbox worker (5-second polling interval) with real-time log-based Change Data Capture (e.g. Debezium via PostgreSQL WAL streaming into Apache Kafka).

### Justification for Deferral
- CDC and Kafka introduce massive infrastructure complexity (Zookeeper/KRaft, Kafka brokers, Kafka Connect, Debezium plugins).
- For the operational volume of training organizations and evaluation centers, transactional outbox polling provides 100% data reliability, zero message loss, and sub-5-second latency while remaining completely lightweight, beginner-friendly, and runnable locally with zero external cloud dependencies.
