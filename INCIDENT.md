# INCIDENT REPORT: Production Outage & Data Cross-Contamination (10:12 UTC)

**Incident ID**: INC-20260922-1012  
**Date/Time**: 2026-09-22 10:12 UTC  
**Severity**: P1 - High (Data Integrity Violation & Cross-Tenant Data Leakage)  
**Status**: Resolved / Durable Repair Defined  
**Author**: Antigravity Senior Engineering Team  

---

## 1. Executive Summary

At 10:12 UTC, approximately seven minutes after a release deployed at 10:05 UTC, three distinct user-impacting symptoms occurred:
1. A single evaluator click generated duplicate attempts (`attempt 991` and `attempt 992`) for student `s44`.
2. Dashboard readiness scores fluctuated erratically (`78` → `84` → `81` on refresh).
3. A cross-tenant data leak occurred where tenant `t-green` observed student records belonging to tenant `t-blue`.

This incident was caused by four compounding, independent defects released in the 10:05 UTC deployment:
- **Defect 1**: Missing database uniqueness constraint on `idempotency_records(tenant_id, key)` allowing race conditions to double-commit.
- **Defect 2**: Cross-tenant cache poisoning caused by shortening Redis/application cache keys from `tenantId:status:page` to `status`.
- **Defect 3**: Non-atomic read-modify-write score recalculation in application memory without row-locking.
- **Defect 4**: Unreliable distributed state write: MongoDB event timeout was silently swallowed while PostgreSQL committed.

---

## 2. Evidence & Timeline Analysis

### Chronological Log Trace
```text
10:05:00 UTC - Release deployment completed to production cluster.
10:12:01.102 UTC - req=a91 tenant=t-blue user=u17 POST /students/s44/attempts key=k-778 score=90
10:12:01.119 UTC - req=b03 tenant=t-blue user=u17 POST /students/s44/attempts key=k-778 score=90 (17ms later)
10:12:01.182 UTC - req=a91 sql attempt.insert id=991 committed
10:12:01.190 UTC - req=b03 sql attempt.insert id=992 committed (DUPLICATE ATTEMPT INSERTED)
10:12:01.207 UTC - req=a91 mongo event.insert eventId=e-991 success
10:12:01.211 UTC - req=b03 mongo event.insert eventId=e-992 timeout (ERROR CAUGHT & SWALLOWED)
10:12:01.244 UTC - req=b03 response=201 attemptId=992 returned to client
10:12:01.249 UTC - req=a91 response=201 attemptId=991 returned to client
10:12:04.331 UTC - req=c10 tenant=t-green GET /students?status=READY cache=hit cacheKey=students:READY
```

---

## 3. Separation of Confirmed Facts vs. Hypotheses

### Confirmed Facts
1. **Fact 1**: Requests `a91` and `b03` arrived within 17 milliseconds of each other with identical `tenant=t-blue`, `user=u17`, `student=s44`, `key=k-778`, and `score=90`.
2. **Fact 2**: Both requests committed distinct rows to PostgreSQL (`id=991` and `id=992`).
3. **Fact 3**: `idempotency_records` schema lacks a unique constraint on `(tenant_id, key)`.
4. **Fact 4**: The cache key was shortened in the 10:05 UTC deployment from `tenantId:status:page` to `status`.
5. **Fact 5**: Request `c10` for `tenant=t-green` hit `cacheKey=students:READY`, serving cached data populated by `tenant=t-blue`.
6. **Fact 6**: MongoDB event `e-992` timed out, but the HTTP request still returned `201 Created` because the error was caught and only logged.
7. **Fact 7**: Score recalculation reads attempts into application memory and writes `students.current_score`.

### Hypotheses
1. **Hypothesis 1**: The client browser or mobile client sent duplicate HTTP requests due to an accidental double-click or a client-side network timeout retry.
2. **Hypothesis 2**: The score fluctuation `78 → 84 → 81` occurred because `req=a91` and `req=b03` calculated readiness concurrently. One request read the pre-existing attempts plus one new attempt (calculating 84), while the other request calculated or overwrote with an intermediate or stale state. Upon refresh, the tie-breaking query or updated set of non-voided attempts settled on 81.
3. **Hypothesis 3**: MongoDB latency spiked at 10:12 UTC, exceeding the client driver's timeout threshold.

---

## 4. Immediate Containment (First 15 Minutes)

### Step 1: Immediate Cache Invalidation & Disable Global Cache (T+0 to T+5 min)
- **Action**: Flush all global cache entries: `FLUSHALL` or delete keys matching `students:*`.
- **Action**: Hot-disable caching via feature flag or deploy emergency config setting `ENABLE_STUDENT_CACHE=false`.
- **Rationale**: Immediately stops cross-tenant data leakage to other users.

### Step 2: Rollback Deployment to Pre-10:05 UTC Release (T+5 to T+10 min)
- **Action**: Execute rollback to previous stable deployment version.
- **Rationale**: Restores tenant-scoped cache keys (`tenantId:status:page`) and previous stable behavior while engineering durable fixes.

### Step 3: Enable Audit Log Monitoring (T+10 to T+15 min)
- **Action**: Run SQL inspection to detect any other duplicate attempts submitted since 10:05 UTC.
- **Action**: Notify security & privacy compliance team of potential PII exposure under data leak protocol.

---

## 5. Durable Engineering Repairs

### 1. Permanent Fix for Idempotency
- **Root Cause**: Absence of a composite unique index on `(tenant_id, key)` allowed concurrent threads to simultaneously evaluate "not found" and insert duplicate records.
- **Durable Solution**:
  ```sql
  -- Add unique constraint
  ALTER TABLE idempotency_records ADD CONSTRAINT uq_idempotency_tenant_key UNIQUE (tenant_id, key);
  CREATE INDEX idx_idempotency_expiry ON idempotency_records(expires_at);
  ```
- **Transaction Strategy**: Use `SELECT ... FOR UPDATE` inside the transaction to acquire an exclusive row lock on the idempotency key, or use `INSERT ... ON CONFLICT (tenant_id, key) DO UPDATE`. Concurrent duplicate requests serialize on the lock and replay the original outcome.

### 2. Permanent Fix for Cache Isolation
- **Root Cause**: Cache keys stripped tenant isolation (`students:READY` instead of `tenantId:status:page`).
- **Durable Solution**:
  - Enforce mandatory tenant prefixing in cache key generator helper:
    ```javascript
    const generateCacheKey = (tenantId, resource, params) => {
      if (!tenantId) throw new Error("Security Violation: Cannot create cache key without tenantId");
      return `tenant:${tenantId}:${resource}:${JSON.stringify(params)}`;
    };
    ```
  - Add automated linter/integration test rejecting any cache key format that lacks `tenantId`.

### 3. Permanent Fix for Score Recomputation
- **Root Cause**: Application-level read-modify-write without row locks allows concurrent submissions to calculate readiness on stale snapshots and overwrite each other.
- **Durable Solution**:
  - Acquire row-level lock on the student row inside the transaction:
    ```sql
    SELECT id, version FROM students WHERE id = $1 AND tenant_id = $2 FOR UPDATE;
    ```
  - Recompute readiness inside the same transaction or using database-side A4 window queries.
  - Increment optimistic lock `version = version + 1`.

### 4. Permanent Fix for Event Reliability (Outbox Pattern)
- **Root Cause**: Attempting direct dual-writes to PostgreSQL and MongoDB. Swallowing MongoDB errors causes audit loss; failing the request after PostgreSQL commit causes false failure.
- **Durable Solution**:
  - Implement Transactional Outbox Pattern:
    - PostgreSQL attempt insert and `outbox_events` insert occur within the SAME relational transaction.
    - Background publisher asynchronously flushes pending outbox events to MongoDB.
    - MongoDB enforces unique index on `eventId`. Retries are idempotent and safe.

---

## 6. Safe Data Repair Plan

### Step 1: Detect Duplicate Attempts Without Modifying Data
Execute non-destructive query to detect all duplicate attempts submitted since 10:05 UTC:
```sql
SELECT 
    tenant_id,
    student_id,
    competency_id,
    score,
    evaluator_id,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(id ORDER BY id ASC) as attempt_ids,
    MIN(submitted_at) as first_submitted,
    MAX(submitted_at) as last_submitted
FROM attempts
WHERE created_at >= '2026-09-22 10:05:00+00'
GROUP BY tenant_id, student_id, competency_id, score, evaluator_id
HAVING COUNT(*) > 1;
```

### Step 2: Safely Void Duplicates (Do NOT Hard Delete)
Per compliance and auditing rules, never delete relational records. Instead, flag duplicate attempts as `is_void = TRUE`:
```sql
-- Void the duplicate attempt with the higher ID (keep attempt 991, void 992)
UPDATE attempts 
SET is_void = TRUE, 
    notes = COALESCE(notes, '') || ' [VOIDED: Auto-repair duplicate submission of attempt 991]'
WHERE id = 992 AND tenant_id = 't-blue' AND student_id = 's44';
```

### Step 3: Trigger Authoritative Score Recomputation
Re-run the authoritative scoring service for affected students:
```sql
-- Authoritative score recalculation query (A4 logic)
UPDATE students s
SET current_score = calc.score,
    current_readiness = calc.status,
    updated_at = NOW()
FROM (
    -- Authoritative calculated readiness from non-void attempts
    SELECT 
        student_id, 
        ROUND(SUM(score * weight)::numeric, 2) as score,
        CASE 
            WHEN COUNT(competency_id) < 4 THEN 'INCOMPLETE'
            WHEN SUM(score * weight) >= 80 THEN 'READY'
            WHEN SUM(score * weight) >= 65 THEN 'NEARLY_READY'
            WHEN SUM(score * weight) >= 50 THEN 'DEVELOPING'
            ELSE 'NEEDS_PREPARATION'
        END as status
    FROM (
        SELECT DISTINCT ON (student_id, competency_id)
            student_id, competency_id, score, weight
        FROM (
            SELECT a.student_id, a.competency_id, a.score, c.weight, a.submitted_at, a.id
            FROM attempts a
            JOIN competencies c ON a.competency_id = c.id
            WHERE a.student_id = 's44' AND a.tenant_id = 't-blue' AND a.is_void = FALSE
            ORDER BY a.student_id, a.competency_id, a.submitted_at DESC, a.id DESC
        ) ranked
    ) latest
    GROUP BY student_id
) calc
WHERE s.id = calc.student_id AND s.tenant_id = 't-blue';
```

---

## 7. Automated Tests, Dashboards & Alerting

### Automated Regression Tests Added
1. **Concurrency Test**: 3 concurrent POST requests with identical idempotency key produce exactly 1 attempt and 1 outbox event.
2. **Cache Key Isolation Test**: Integration test verifying cache key contains tenant ID and cross-tenant reads produce cache misses.
3. **MongoDB Failure Injection Test**: Proves PostgreSQL commits during MongoDB outage, outbox preserves event, and background worker retries successfully upon reconnection.

### Production Alerts & Dashboards
1. **Alert: Duplicate Idempotency Key Attempt**: Triggers if > 0 duplicate key conflicts occur per minute (`ALERT_IDEMP_COLLISION`).
2. **Alert: MongoDB Outbox Lag**: Triggers if pending outbox events > 50 or pending duration > 60 seconds (`ALERT_OUTBOX_LAG`).
3. **Alert: Cross-Tenant Cache Access**: WAF/Application alert if request tenant ID does not match cache key namespace (`ALERT_TENANT_LEAK`).

---

## 8. Missing Evidence & How to Obtain It

| Missing Evidence | Why It Matters | How to Obtain It |
| :--- | :--- | :--- |
| **Client Network Traces** | Proves whether user double-clicked or mobile OS retried after timeout. | Inspect client-side telemetry, browser error logs, or user agent request headers. |
| **Redis / Cache Server Access Logs** | Determines how many users in `t-green` received `t-blue` student data between 10:05 and 10:12 UTC. | Enable and extract Redis `MONITOR` or access logs around key `students:READY`. |
| **MongoDB Replica Set Logs** | Identifies exact reason for `e-992` timeout (e.g. connection pool exhaustion, write lock contention, or network partition). | Inspect MongoDB server `mongod.log` for 10:12:01 UTC. |
| **Application Git Diff for 10:05 Deployment** | Identifies the specific commit and author who removed `tenantId` from cache key. | Run `git log -p -S "cacheKey" --since="2026-09-22 09:00:00"` in application repository. |
