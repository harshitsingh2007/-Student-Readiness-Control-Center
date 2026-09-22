-- Migration: 001_initial_schema.sql
-- Description: Sets up multi-tenant relational schema with PostgreSQL as the source of truth.
-- Conforms to tenant isolation, optimistic concurrency, deterministic tie-breaking, and transactional outbox.

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users Table (Tenant Membership & Role-Based Access)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('ADMIN', 'EVALUATOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_tenant_email UNIQUE(tenant_id, email)
);

-- 3. Competencies Table (Data-Driven Configuration)
-- Adding a fifth competency or updating weights requires no code changes.
CREATE TABLE IF NOT EXISTS competencies (
    id VARCHAR(64) PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL,
    code VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    weight NUMERIC(5,4) NOT NULL CHECK (weight > 0 AND weight <= 1),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Students Table (Optimistic Concurrency via 'version')
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    current_score NUMERIC(5,2),
    current_readiness VARCHAR(32) DEFAULT 'INCOMPLETE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_students_tenant_email UNIQUE(tenant_id, email)
);

-- 5. Attempts Table (Competency Evaluation Evidence)
-- Tie-breaking order: submitted_at DESC, id DESC. Void attempts are excluded from readiness.
CREATE TABLE IF NOT EXISTS attempts (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    competency_id VARCHAR(64) NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
    score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
    evaluator_id VARCHAR(64) NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_void BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Idempotency Records Table
-- Composite Primary Key (tenant_id, key) prevents duplicate execution within a tenant.
-- request_fingerprint ensures that if a key is reused with a different payload, it is rejected.
CREATE TABLE IF NOT EXISTS idempotency_records (
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    request_fingerprint VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
    response_status_code INT,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, key)
);

-- 7. Transactional Outbox Events Table
-- Guarantees reliable publishing of operational events to MongoDB without distributed two-phase commits.
CREATE TABLE IF NOT EXISTS outbox_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_id VARCHAR(64) UNIQUE NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

-- Indexes for performance and multi-tenant security
CREATE INDEX IF NOT EXISTS idx_students_tenant_lookup ON students(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_students_tenant_readiness ON students(tenant_id, current_readiness);
CREATE INDEX IF NOT EXISTS idx_students_tenant_name ON students(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_attempts_tiebreaker ON attempts(student_id, competency_id, submitted_at DESC, id DESC) WHERE is_void = FALSE;
CREATE INDEX IF NOT EXISTS idx_attempts_tenant_student ON attempts(tenant_id, student_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records(expires_at);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at) WHERE status = 'PENDING';
