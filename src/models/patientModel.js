// Data access for app_patients.
const pool = require('../config/db');

async function findAll() {
  const [rows] = await pool.query(
    `SELECT id, full_name, date_of_birth, gender, notes
     FROM app_patients
     ORDER BY id`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT id, full_name, date_of_birth, gender, notes
     FROM app_patients
     WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { findAll, findById };
