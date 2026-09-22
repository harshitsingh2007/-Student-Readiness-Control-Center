-- Seed: seed_data.sql
-- Description: Seeds tenants, users, data-driven competencies, and students with all readiness states.
-- Includes equal-timestamp tie-breaking examples and multi-tenant isolation scenarios.

-- 1. Insert Tenants
INSERT INTO tenants (id, name, status) VALUES
('tenant-alpha', 'Alpha Technical Institute', 'ACTIVE'),
('tenant-beta', 'Beta Global Academy', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. Insert Users (Password: Password123! hashed with bcrypt)
INSERT INTO users (id, tenant_id, name, email, password_hash, role) VALUES
('user-alpha-admin', 'tenant-alpha', 'Alpha Administrator', 'admin@alpha.com', '$2a$10$kLOCPiG4CJSgwRhLMhnOSu4nZl6Ee4MB/yRrUpG6bnps1yTgIc0gW', 'ADMIN'),
('user-alpha-eval', 'tenant-alpha', 'Alpha Senior Evaluator', 'evaluator@alpha.com', '$2a$10$kLOCPiG4CJSgwRhLMhnOSu4nZl6Ee4MB/yRrUpG6bnps1yTgIc0gW', 'EVALUATOR'),
('user-beta-admin', 'tenant-beta', 'Beta Administrator', 'admin@beta.com', '$2a$10$kLOCPiG4CJSgwRhLMhnOSu4nZl6Ee4MB/yRrUpG6bnps1yTgIc0gW', 'ADMIN'),
('user-beta-eval', 'tenant-beta', 'Beta Evaluator', 'evaluator@beta.com', '$2a$10$kLOCPiG4CJSgwRhLMhnOSu4nZl6Ee4MB/yRrUpG6bnps1yTgIc0gW', 'EVALUATOR')
ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- 3. Insert Data-Driven Competencies
INSERT INTO competencies (id, key, code, name, weight, active, required) VALUES
('comp-fe', 'frontend', 'frontend', 'Frontend Development', 0.3000, TRUE, TRUE),
('comp-be', 'backend', 'backend', 'Backend Engineering', 0.3000, TRUE, TRUE),
('comp-db', 'databases', 'databases', 'Database Systems', 0.2500, TRUE, TRUE),
('comp-ps', 'problem_solving', 'problem_solving', 'Problem Solving & Logic', 0.1500, TRUE, TRUE)
ON CONFLICT (key) DO UPDATE SET weight = EXCLUDED.weight, active = EXCLUDED.active, required = EXCLUDED.required, code = EXCLUDED.code;

-- 4. Insert Students for Tenant Alpha
INSERT INTO students (id, tenant_id, name, email, version, current_score, current_readiness) VALUES
('student-alpha-1', 'tenant-alpha', 'Aarav Sharma', 'aarav@alpha.edu', 1, 85.25, 'READY'),
('student-alpha-2', 'tenant-alpha', 'Priya Patel', 'priya@alpha.edu', 1, 71.70, 'NEARLY_READY'),
('student-alpha-3', 'tenant-alpha', 'Rohan Verma', 'rohan@alpha.edu', 1, 56.40, 'DEVELOPING'),
('student-alpha-4', 'tenant-alpha', 'Ananya Gupta', 'ananya@alpha.edu', 1, 43.20, 'NEEDS_PREPARATION'),
('student-alpha-5', 'tenant-alpha', 'Vikram Malhotra', 'vikram@alpha.edu', 1, NULL, 'INCOMPLETE'),
('student-alpha-6', 'tenant-alpha', 'Kavita Rao', 'kavita@alpha.edu', 1, 86.80, 'READY')
ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name;

-- 5. Insert Students for Tenant Beta (Isolated from Alpha)
INSERT INTO students (id, tenant_id, name, email, version, current_score, current_readiness) VALUES
('student-beta-1', 'tenant-beta', 'Marcus Chen', 'marcus@beta.org', 1, 88.50, 'READY'),
('student-beta-2', 'tenant-beta', 'Elena Rodriguez', 'elena@beta.org', 1, NULL, 'INCOMPLETE')
ON CONFLICT (tenant_id, email) DO UPDATE SET name = EXCLUDED.name;

-- 6. Insert Attempts for Tenant Alpha Students
-- Aarav Sharma (READY: FE 85*0.3 + BE 90*0.3 + DB 80*0.25 + PS 85*0.15 = 85.25)
INSERT INTO attempts (tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, is_void, notes) VALUES
('tenant-alpha', 'student-alpha-1', 'comp-fe', 85.00, 'user-alpha-eval', '2026-09-10 10:00:00Z', FALSE, 'Solid React & TypeScript work'),
('tenant-alpha', 'student-alpha-1', 'comp-be', 90.00, 'user-alpha-eval', '2026-09-11 11:00:00Z', FALSE, 'Clean Express middleware design'),
('tenant-alpha', 'student-alpha-1', 'comp-db', 80.00, 'user-alpha-eval', '2026-09-12 12:00:00Z', FALSE, 'Proper indexing and constraints'),
('tenant-alpha', 'student-alpha-1', 'comp-ps', 85.00, 'user-alpha-eval', '2026-09-13 14:00:00Z', FALSE, 'Well structured algorithmic solution');

-- Priya Patel (NEARLY_READY: FE 75*0.3 + BE 70*0.3 + DB 72*0.25 + PS 68*0.15 = 71.70)
INSERT INTO attempts (tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, is_void, notes) VALUES
('tenant-alpha', 'student-alpha-2', 'comp-fe', 75.00, 'user-alpha-eval', '2026-09-10 10:00:00Z', FALSE, 'Good UI components'),
('tenant-alpha', 'student-alpha-2', 'comp-be', 70.00, 'user-alpha-eval', '2026-09-11 11:00:00Z', FALSE, 'API works, needs better error handling'),
('tenant-alpha', 'student-alpha-2', 'comp-db', 72.00, 'user-alpha-eval', '2026-09-12 12:00:00Z', FALSE, 'Basic relations established'),
('tenant-alpha', 'student-alpha-2', 'comp-ps', 68.00, 'user-alpha-eval', '2026-09-13 14:00:00Z', FALSE, 'Functional solution, sub-optimal space complexity');

-- Rohan Verma (DEVELOPING: FE 55*0.3 + BE 58*0.3 + DB 60*0.25 + PS 50*0.15 = 56.40)
INSERT INTO attempts (tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, is_void, notes) VALUES
('tenant-alpha', 'student-alpha-3', 'comp-fe', 55.00, 'user-alpha-eval', '2026-09-10 10:00:00Z', FALSE, 'Basic HTML/CSS, needs React hook understanding'),
('tenant-alpha', 'student-alpha-3', 'comp-be', 58.00, 'user-alpha-eval', '2026-09-11 11:00:00Z', FALSE, 'Basic endpoints created'),
('tenant-alpha', 'student-alpha-3', 'comp-db', 60.00, 'user-alpha-eval', '2026-09-12 12:00:00Z', FALSE, 'Tables created without foreign keys'),
('tenant-alpha', 'student-alpha-3', 'comp-ps', 50.00, 'user-alpha-eval', '2026-09-13 14:00:00Z', FALSE, 'Passes basic test cases only');

-- Ananya Gupta (NEEDS_PREPARATION: FE 40*0.3 + BE 45*0.3 + DB 42*0.25 + PS 48*0.15 = 43.20)
INSERT INTO attempts (tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, is_void, notes) VALUES
('tenant-alpha', 'student-alpha-4', 'comp-fe', 40.00, 'user-alpha-eval', '2026-09-10 10:00:00Z', FALSE, 'Incomplete UI layout'),
('tenant-alpha', 'student-alpha-4', 'comp-be', 45.00, 'user-alpha-eval', '2026-09-11 11:00:00Z', FALSE, 'Unhandled promise rejections'),
('tenant-alpha', 'student-alpha-4', 'comp-db', 42.00, 'user-alpha-eval', '2026-09-12 12:00:00Z', FALSE, 'Missing constraints'),
('tenant-alpha', 'student-alpha-4', 'comp-ps', 48.00, 'user-alpha-eval', '2026-09-13 14:00:00Z', FALSE, 'Runtime errors on edge cases');

-- Vikram Malhotra (INCOMPLETE: Missing Problem Solving competency attempt!)
INSERT INTO attempts (tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, is_void, notes) VALUES
('tenant-alpha', 'student-alpha-5', 'comp-fe', 95.00, 'user-alpha-eval', '2026-09-10 10:00:00Z', FALSE, 'Superb frontend implementation'),
('tenant-alpha', 'student-alpha-5', 'comp-be', 90.00, 'user-alpha-eval', '2026-09-11 11:00:00Z', FALSE, 'Robust backend services'),
('tenant-alpha', 'student-alpha-5', 'comp-db', 88.00, 'user-alpha-eval', '2026-09-12 12:00:00Z', FALSE, 'Optimized SQL indexes');

-- Kavita Rao (TIE-BREAKER DEMONSTRATION)
-- Equal timestamp tie: two attempts for frontend submitted at exact same second '2026-09-14 10:00:00Z'
-- Lower ID attempt: score 60
-- Higher ID attempt: score 92
-- Business Rule: deterministic tie-breaker ensures higher attempt.id wins!
INSERT INTO attempts (tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, is_void, notes) VALUES
('tenant-alpha', 'student-alpha-6', 'comp-fe', 60.00, 'user-alpha-eval', '2026-09-14 10:00:00Z', FALSE, 'First simultaneous attempt'),
('tenant-alpha', 'student-alpha-6', 'comp-fe', 92.00, 'user-alpha-eval', '2026-09-14 10:00:00Z', FALSE, 'Second simultaneous attempt (wins by id)'),
('tenant-alpha', 'student-alpha-6', 'comp-be', 85.00, 'user-alpha-eval', '2026-09-14 11:00:00Z', FALSE, 'High quality code'),
('tenant-alpha', 'student-alpha-6', 'comp-db', 84.00, 'user-alpha-eval', '2026-09-14 12:00:00Z', FALSE, 'Normalized design'),
('tenant-alpha', 'student-alpha-6', 'comp-ps', 88.00, 'user-alpha-eval', '2026-09-14 13:00:00Z', FALSE, 'Optimal algorithm');

-- Tenant Beta attempts
INSERT INTO attempts (tenant_id, student_id, competency_id, score, evaluator_id, submitted_at, is_void, notes) VALUES
('tenant-beta', 'student-beta-1', 'comp-fe', 90.00, 'user-beta-eval', '2026-09-15 09:00:00Z', FALSE, 'Beta student excellent React'),
('tenant-beta', 'student-beta-1', 'comp-be', 88.00, 'user-beta-eval', '2026-09-15 10:00:00Z', FALSE, 'Beta student excellent Node'),
('tenant-beta', 'student-beta-1', 'comp-db', 86.00, 'user-beta-eval', '2026-09-15 11:00:00Z', FALSE, 'Beta student PostgreSQL queries'),
('tenant-beta', 'student-beta-1', 'comp-ps', 90.00, 'user-beta-eval', '2026-09-15 12:00:00Z', FALSE, 'Beta student problem solving');
