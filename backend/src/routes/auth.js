const express = require('express');
const router = express.Router();
const { login, getMe, getAvailableTenants, demoLogin, switchTenant } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.post('/demo-login', demoLogin);
router.post('/switch-tenant', authenticate, switchTenant);
router.get('/tenants', getAvailableTenants);
router.get('/me', authenticate, getMe);

module.exports = router;
