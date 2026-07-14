const express = require('express');
const authenticate = require('../middleware/auth');
const { listPatients, latestVitals, history } = require('../controllers/patientController');

const router = express.Router();

// All patient/data endpoints require a valid JWT.
router.use(authenticate);

router.get('/', listPatients);
router.get('/:id/latest', latestVitals);
router.get('/:id/history', history);

module.exports = router;
