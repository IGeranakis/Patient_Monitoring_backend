// Data access for app_users.
const pool = require('../config/db');

async function findByUsername(username) {
  const [rows] = await pool.query(
    'SELECT id, username, password_hash, full_name, role FROM app_users WHERE username = ?',
    [username]
  );
  return rows[0] || null;
}

async function findAll() {
  const [rows] = await pool.query(
    `SELECT id, username, full_name, role, created_at
     FROM app_users
     ORDER BY username`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, username, full_name, role, created_at FROM app_users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function create({ username, passwordHash, fullName, role }) {
  const [result] = await pool.query(
    'INSERT INTO app_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    [username, passwordHash, fullName, role]
  );
  return result.insertId;
}

// Partial update: only the provided fields are changed. Username is immutable.
async function update(id, { fullName, passwordHash }) {
  const sets = [];
  const values = [];
  if (fullName !== undefined) {
    sets.push('full_name = ?');
    values.push(fullName);
  }
  if (passwordHash !== undefined) {
    sets.push('password_hash = ?');
    values.push(passwordHash);
  }
  if (sets.length === 0) return 0;
  values.push(id);
  const [result] = await pool.query(
    `UPDATE app_users SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
  return result.affectedRows;
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM app_users WHERE id = ?', [id]);
  return result.affectedRows;
}

module.exports = { findByUsername, findAll, findById, create, update, remove };
