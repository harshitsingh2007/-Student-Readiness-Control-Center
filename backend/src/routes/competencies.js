/**
 * Competencies API Route (Data-Driven Configuration)
 * 
 * WHAT: Exposes active competency definitions from PostgreSQL.
 * WHY: Phase 5 requirement: Adding a fifth active competency in PostgreSQL
 *      makes it appear automatically in frontend without modifying frontend components.
 */

const express = require('express');
const router = express.Router();
const { getActiveCompetencies } = require('../services/readinessService');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const competencies = await getActiveCompetencies();
    return res.status(200).json({
      competencies,
      requestId: req.requestId,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
