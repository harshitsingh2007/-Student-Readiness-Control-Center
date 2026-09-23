# API CONTRACT DOCUMENTATION
**Project**: Student Readiness Control Center  
**Base URL**: `http://localhost:5002/api`  
**Standard Error Contract**: Section 9 Specification  

---

## 1. Global Invariants & Headers

### Request Headers
- `Authorization: Bearer <jwt_token>`: Required for all protected endpoints.
- `Idempotency-Key: <unique_string>`: Required for `POST /api/students/:id/attempts`.
- `X-Request-Id: <uuid>`: Optional client tracking ID. If omitted, the server assigns a UUIDv4.

### Response Envelope: Error Structure
```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable explanation of error",
  "requestId": "req_6434c083-7058-4e5f-8b2a-6dee4904d63c",
  "fieldErrors": {}
}
```

---

## 2. Authentication Endpoints

### `POST /api/auth/login`
Authenticates a user and returns a signed JWT containing `{ userId, tenantId, role, email }`.

**Request Body**:
```json
{
  "email": "evaluator@alpha.com",
  "password": "Password123!"
}
```

**Response `200 OK`**:
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "user-alpha-eval",
    "tenantId": "tenant-alpha",
    "tenantName": "Alpha Technical Institute",
    "name": "Alpha Senior Evaluator",
    "email": "evaluator@alpha.com",
    "role": "EVALUATOR"
  },
  "requestId": "req_..."
}
```

---

## 3. Student Endpoints

### `GET /api/students`
Retrieves paginated students strictly scoped to the caller's authenticated `tenantId`.

**Query Parameters**:
- `search` (string): Filters students by partial name or email (case-insensitive).
- `status` (string): Filter by readiness status (`READY`, `NEARLY_READY`, `DEVELOPING`, `NEEDS_PREPARATION`, `INCOMPLETE`).
- `sort` (string): Sort field (`name`, `current_score`, `current_readiness`, `updated_at`). Default: `name`.
- `order` (string): Sort direction (`ASC` or `DESC`). Default: `ASC`.
- `page` (integer): Page number (min: 1). Default: 1.
- `limit` (integer): Page size (max: 50). Default: 10.

**Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "student-alpha-1",
      "name": "Aarav Sharma",
      "email": "aarav@alpha.edu",
      "version": 1,
      "currentScore": 85.25,
      "currentReadiness": "READY",
      "createdAt": "2026-09-01T10:00:00.000Z",
      "updatedAt": "2026-09-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 6,
    "totalPages": 1
  },
  "summaryScore": 68.67,
  "requestId": "req_..."
}
```

---

### `POST /api/students`
Creates a new student record strictly scoped to the caller's authenticated `tenantId`.
Initializes the student with `version = 1`, `currentScore = null`, and `currentReadiness = "INCOMPLETE"`.

**Authorization**: `ADMIN`, `EVALUATOR`

**Request Body**:
```json
{
  "name": "Rahul Kumar",
  "email": "rahul@alpha.edu"
}
```

**Response `201 Created`**:
```json
{
  "student": {
    "id": "student-alpha-a719c298-5efc-4e89-8d59-5da7b5da7fc2",
    "name": "Rahul Kumar",
    "email": "rahul@alpha.edu",
    "version": 1,
    "currentScore": null,
    "currentReadiness": "INCOMPLETE",
    "createdAt": "2026-09-23T07:35:00.000Z",
    "updatedAt": "2026-09-23T07:35:00.000Z"
  },
  "message": "Student created successfully.",
  "requestId": "req_..."
}
```

**Error Responses**:
- `400 Bad Request` (`VALIDATION_ERROR`): Name or email missing, empty, invalid format, or exceeding 255 characters.
- `409 Conflict` (`DUPLICATE_STUDENT_EMAIL`): A student with this email already exists in this tenant.

---

### `GET /api/students/:id`
Retrieves complete details for a student, latest attempt per competency, and authoritative readiness.

**Security**: Returns `404 Not Found` if student does not exist OR belongs to another tenant.

**Response `200 OK`**:
```json
{
  "student": {
    "id": "student-alpha-1",
    "name": "Aarav Sharma",
    "email": "aarav@alpha.edu",
    "version": 1,
    "currentScore": 85.25,
    "currentReadiness": "READY"
  },
  "readiness": {
    "score": 85.25,
    "status": "READY",
    "evidence": {
      "frontend": {
        "attemptId": 1,
        "score": 85.0,
        "submittedAt": "2026-09-10T10:00:00.000Z",
        "evaluatorId": "user-alpha-eval",
        "notes": "Solid work"
      }
    },
    "missingCompetencies": []
  },
  "competencies": [
    { "id": "comp-fe", "key": "frontend", "name": "Frontend Development", "weight": 0.3 }
  ],
  "requestId": "req_..."
}
```

---

### `PATCH /api/students/:id`
Updates allowlisted student fields (`name`, `email`) using optimistic concurrency control.

**Request Body**:
```json
{
  "expectedVersion": 1,
  "name": "Aarav Sharma Updated",
  "email": "aarav.new@alpha.edu"
}
```

**Response `200 OK`**:
```json
{
  "student": {
    "id": "student-alpha-1",
    "name": "Aarav Sharma Updated",
    "email": "aarav.new@alpha.edu",
    "version": 2
  },
  "message": "Student updated successfully.",
  "requestId": "req_..."
}
```

**Response `409 Conflict` (Version Stale)**:
```json
{
  "code": "VERSION_CONFLICT",
  "message": "Conflict: Stale version detected. Current student version is 2, but expectedVersion was 1.",
  "currentVersion": 2,
  "requestId": "req_...",
  "fieldErrors": {}
}
```

---

## 4. Assessment Attempt Endpoints

### `POST /api/students/:id/attempts`
Creates an assessment attempt with transactional row-locking and idempotency protection.

**Required Headers**:
- `Idempotency-Key: <unique_string>`
- `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "competencyKey": "frontend",
  "score": 92.5,
  "notes": "Excellent performance on React rendering"
}
```

**Response `201 Created`**:
```json
{
  "attempt": {
    "id": "991",
    "studentId": "student-alpha-1",
    "competencyKey": "frontend",
    "competencyName": "Frontend Development",
    "score": 92.5,
    "evaluatorId": "user-alpha-eval",
    "submittedAt": "2026-09-22T17:25:28.000Z",
    "notes": "Excellent performance"
  },
  "readiness": {
    "score": 87.5,
    "status": "READY"
  },
  "eventId": "evt_...",
  "requestId": "req_..."
}
```

**Response `201 Created` (Idempotent Replay)**:
- Same payload returned.
- Response header includes `X-Idempotency-Replay: true`.
- Zero database rows or duplicate events inserted.

**Response `422 Unprocessable Entity` (Fingerprint Mismatch)**:
```json
{
  "code": "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_BODY",
  "message": "Idempotency key has already been used with a different request payload.",
  "requestId": "req_...",
  "fieldErrors": {}
}
```

---

## 5. Operational Activity & Analytics Endpoints

### `GET /api/students/:id/activity`
Returns append-only operational events for a student from MongoDB.

**Response `200 OK`**:
```json
{
  "events": [
    {
      "eventId": "evt_...",
      "tenantId": "tenant-alpha",
      "studentId": "student-alpha-1",
      "attemptId": 991,
      "eventType": "attempt.succeeded",
      "occurredAt": "2026-09-22T17:25:28.000Z",
      "metadata": { "competencyKey": "frontend", "score": 92.5 }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

---

### `GET /api/analytics/activity-summary`
Runs 24-hour MongoDB aggregation pipeline per tenant.

**Response `200 OK`**:
```json
{
  "tenantId": "tenant-alpha",
  "timeWindow": "last_24_hours",
  "uniqueSuccessfulAssessments": 5,
  "totalOperationalEvents": 6,
  "rejectedEvents": 1,
  "validationFailureRatePercent": 16.67,
  "p95SubmissionLatencyMs": 42,
  "multipleSuccessEventAnomalies": [],
  "explanation": "Naive document counts over-represent successful assessments due to network retries and duplicate operational events. The aggregation uses distinct attemptId grouping to report true logical successes."
}
```
