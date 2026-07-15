// Data access for app_patients.
// All reads/writes are scoped to the owning doctor (created_by): a doctor
// can only ever see and manage the patients they registered themselves.
const pool = require('../config/db');

async function findAll(ownerId) {
  const [rows] = await pool.query(
    `SELECT id, full_name, date_of_birth, gender, notes, created_by
     FROM app_patients
     WHERE created_by = ?
     ORDER BY id`,
    [ownerId]
  );
  return rows;
}

async function findById(id, ownerId) {
  const [rows] = await pool.query(
    `SELECT id, full_name, date_of_birth, gender, notes, created_by
     FROM app_patients
     WHERE id = ? AND created_by = ?`,
    [id, ownerId]
  );
  return rows[0] || null;
}

async function create({ id, fullName, dateOfBirth, gender, notes, createdBy }) {
  await pool.query(
    `INSERT INTO app_patients (id, full_name, date_of_birth, gender, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, fullName, dateOfBirth || null, gender || null, notes || null, createdBy]
  );
}

// Partial update: only the provided fields are changed. Patient id is
// immutable (it ties the patient to entityIds in hospital.vitals).
async function update(id, ownerId, { fullName, dateOfBirth, gender, notes }) {
  const sets = [];
  const values = [];
  if (fullName !== undefined) {
    sets.push('full_name = ?');
    values.push(fullName);
  }
  if (dateOfBirth !== undefined) {
    sets.push('date_of_birth = ?');
    values.push(dateOfBirth || null);
  }
  if (gender !== undefined) {
    sets.push('gender = ?');
    values.push(gender || null);
  }
  if (notes !== undefined) {
    sets.push('notes = ?');
    values.push(notes || null);
  }
  if (sets.length === 0) return 0;
  values.push(id, ownerId);
  const [result] = await pool.query(
    `UPDATE app_patients SET ${sets.join(', ')} WHERE id = ? AND created_by = ?`,
    values
  );
  return result.affectedRows;
}

async function remove(id, ownerId) {
  const [result] = await pool.query(
    'DELETE FROM app_patients WHERE id = ? AND created_by = ?',
    [id, ownerId]
  );
  return result.affectedRows;
}

// Next free auto-generated patient id in the PatientNNN convention.
// Considers BOTH app_patients and the entityIds already present in
// hospital.vitals, so an id that ever produced measurements is never
// reused (a new patient must not inherit another patient's history).
async function nextPatientId() {
  const [[appRow]] = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(id, 8) AS UNSIGNED)) AS maxN
     FROM app_patients
     WHERE id REGEXP '^Patient[0-9]+$'`
  );
  const [[vitRow]] = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(SUBSTRING_INDEX(entityId, ':', 1), 8) AS UNSIGNED)) AS maxN
     FROM vitals
     WHERE entityId REGEXP '^Patient[0-9]+:'`
  );
  const next = Math.max(appRow.maxN || 0, vitRow.maxN || 0) + 1;
  return `Patient${String(next).padStart(3, '0')}`;
}

// Number of patients registered by a given doctor (used to block deleting
// a doctor account that still owns patients).
async function countByOwner(ownerId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS n FROM app_patients WHERE created_by = ?',
    [ownerId]
  );
  return rows[0].n;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
  countByOwner,
  nextPatientId
};
