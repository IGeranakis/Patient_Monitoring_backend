// Patients + vitals endpoints.
// Every endpoint is scoped to the logged-in doctor (req.user.id): doctors
// only see and manage the patients they registered. Patients owned by
// another doctor behave exactly like nonexistent ones (404).
const patientModel = require('../models/patientModel');
const vitalsModel = require('../models/vitalsModel');
const simulator = require('../simulator-manager');
function toDto(p) {
  return {
    id: p.id,
    fullName: p.full_name,
    dateOfBirth: p.date_of_birth,
    gender: p.gender,
    notes: p.notes
  };
}

// GET /api/patients — only the requesting doctor's patients.
async function listPatients(req, res, next) {
  try {
    const patients = await patientModel.findAll(req.user.id);
    return res.json(patients.map(toDto));
  } catch (err) {
    return next(err);
  }
}

// GET /api/patients/:id/latest
// Newest value of each numeric vital across all the patient's devices.
async function latestVitals(req, res, next) {
  try {
    const patient = await patientModel.findById(req.params.id, req.user.id);
    if (!patient) {
      return res.status(404).json({ error: 'Ο ασθενής δεν βρέθηκε.' });
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
    const patient = await patientModel.findById(req.params.id, req.user.id);
    if (!patient) {
      return res.status(404).json({ error: 'Ο ασθενής δεν βρέθηκε.' });
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

function validatePatientBody(body, { requireAll }) {
  const { fullName, dateOfBirth, gender } = body;
  if (requireAll || fullName !== undefined) {
    if (!fullName || !fullName.trim()) {
      return 'Το ονοματεπώνυμο είναι υποχρεωτικό.';
    }
  }
  if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth))) {
      return 'Η ημερομηνία γέννησης πρέπει να έχει μορφή YYYY-MM-DD.';
    }
  }
  if (gender !== undefined && gender !== null && gender !== '') {
    if (!['male', 'female', 'other'].includes(gender)) {
      return 'Το φύλο πρέπει να είναι male, female ή other.';
    }
  }
  return null;
}

// POST /api/patients  {fullName, dateOfBirth?, gender?, notes?}
// The patient id is generated automatically by the server in the
// PatientNNN convention (never reusing an id that already has data in
// hospital.vitals). The new patient is owned by the logged-in doctor.
async function createPatient(req, res, next) {
  try {
    const { fullName, dateOfBirth, gender, notes } = req.body || {};

    const validationError = validatePatientBody(req.body || {}, { requireAll: true });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Generate the next free id. On the (unlikely) race where two creates
    // pick the same id, ER_DUP_ENTRY triggers a retry with a fresh id.
    let id = null;
    for (let attempt = 0; attempt < 5 && id === null; attempt++) {
      const candidate = await patientModel.nextPatientId();
      try {
        await patientModel.create({
          id: candidate,
          fullName: fullName.trim(),
          dateOfBirth: dateOfBirth || null,
          gender: gender || null,
          notes: notes || null,
          createdBy: req.user.id
        });
        id = candidate;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    if (id === null) {
      return res.status(503).json({
        error: 'Δεν ήταν δυνατή η δημιουργία κωδικού ασθενή. Προσπαθήστε ξανά.'
      });
    }

    simulator.restart().catch((err) =>
      console.error('simulator restart failed:', err.message)
    );

    const created = await patientModel.findById(id, req.user.id);
    return res.status(201).json(toDto(created));
  } catch (err) {
    return next(err);
  }
}

// PUT /api/patients/:id  {fullName?, dateOfBirth?, gender?, notes?}  (id immutable)
async function updatePatient(req, res, next) {
  try {
    const existing = await patientModel.findById(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Ο ασθενής δεν βρέθηκε.' });
    }

    const validationError = validatePatientBody(req.body || {}, { requireAll: false });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { fullName, dateOfBirth, gender, notes } = req.body || {};
    const changes = {};
    if (fullName !== undefined) changes.fullName = fullName.trim();
    if (dateOfBirth !== undefined) changes.dateOfBirth = dateOfBirth;
    if (gender !== undefined) changes.gender = gender;
    if (notes !== undefined) changes.notes = notes;

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ error: 'Δεν δόθηκαν πεδία προς ενημέρωση.' });
    }

    await patientModel.update(req.params.id, req.user.id, changes);
    const updated = await patientModel.findById(req.params.id, req.user.id);
    return res.json(toDto(updated));
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/patients/:id
// Removes the patient record only; measurements in hospital.vitals are
// owned by Cygnus and are never touched.
async function deletePatient(req, res, next) {
  try {
    const affected = await patientModel.remove(req.params.id, req.user.id);
    if (affected === 0) {
      return res.status(404).json({ error: 'Ο ασθενής δεν βρέθηκε.' });
    }
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPatients,
  latestVitals,
  history,
  createPatient,
  updatePatient,
  deletePatient
};
