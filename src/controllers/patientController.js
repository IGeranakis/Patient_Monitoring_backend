// Patients + vitals endpoints.
const patientModel = require('../models/patientModel');
const vitalsModel = require('../models/vitalsModel');

// GET /api/patients
async function listPatients(req, res, next) {
  try {
    const patients = await patientModel.findAll();
    return res.json(
      patients.map((p) => ({
        id: p.id,
        fullName: p.full_name,
        dateOfBirth: p.date_of_birth,
        gender: p.gender,
        notes: p.notes
      }))
    );
  } catch (err) {
    return next(err);
  }
}

// GET /api/patients/:id/latest
// Newest value of each numeric vital across all the patient's devices.
async function latestVitals(req, res, next) {
  try {
    const patient = await patientModel.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    const vitals = await vitalsModel.getLatestVitals(patient.id);
    return res.json({ patientId: patient.id, vitals });
  } catch (err) {
    return next(err);
  }
}

// GET /api/patients/:id/history?attr=heartRate&limit=100
// Time series of one attribute, oldest-first, values as numbers.
async function history(req, res, next) {
  try {
    const patient = await patientModel.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const attr = req.query.attr;
    if (!attr) {
      return res.status(400).json({ error: 'Query parameter "attr" is required, e.g. ?attr=heartRate' });
    }

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 100;
    if (limit > 1000) limit = 1000;

    const points = await vitalsModel.getHistory(patient.id, attr, limit);
    return res.json({ patientId: patient.id, attr, count: points.length, points });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPatients, latestVitals, history };
