/**
 * Express Application Setup & Middleware Pipeline
 * 
 * WHAT: Configures security headers, CORS, rate limiting, request tracking,
 *       route registration, and standardized error handling.
 * WHY: Section 9, 23, 36, 37 requirements:
 *      - Every request assigned a unique requestId.
 *      - Rate limiting and payload bounding (100kb).
 *      - Never expose stack traces or secrets in responses.
 *      - Safe logging without credentials.
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const activityRoutes = require('./routes/activity');

const app = express();

// 1. Request ID Tracking Middleware (Section 36)
app.use((req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  req.requestId = incomingId && typeof incomingId === 'string' ? incomingId.substring(0, 64) : `req_${uuidv4()}`;
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// 2. Safe Structured Request Logging (Section 36)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Exclude password and secrets from logs
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toISOString()}] [${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms ${req.user ? `tenant=${req.user.tenantId}` : ''}`);
    }
  });
  next();
});

// 3. Security: CORS Configuration
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5175';
app.use(cors({
  origin: [corsOrigin, 'http://localhost:5175', 'http://127.0.0.1:5175'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'X-Idempotency-Replay'],
}));

// 4. Security: Request Body Size Limiting (Section 23 & 37)
app.use(express.json({ limit: '100kb' }));

// 5. Security: Basic Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later.',
  },
});
app.use('/api/', limiter);

// 6. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'student-readiness-control-center',
    requestId: req.requestId,
  });
});

// 7. Mount Core API Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/analytics', activityRoutes);

// 8. 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    code: 'ROUTE_NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    requestId: req.requestId,
    fieldErrors: {},
  });
});

// 9. Global Error Handler (Section 9)
app.use(errorHandler);

module.exports = app;
