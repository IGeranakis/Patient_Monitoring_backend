// Data access for app_users.
const pool = require('../config/db');

async function findByUsername(username) {
  const [rows] = await pool.query(
    'SELECT id, username, password_hash, full_name, role FROM app_users WHERE username = ?',
    [username]
  );
  return rows[0] || null;
}

module.exports = { findByUsername };
