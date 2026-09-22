const express = require('express');
const router = express.Router();
const { login, getMe, getAvailableTenants } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.get('/tenants', getAvailableTenants);
router.get('/me', authenticate, getMe);

module.exports = router;
