// Idempotent database initialization.
// Creates the app-owned tables (app_users, app_patients) and seeds:
//   - doctor account:  username "doctor", password "doctor123" (bcrypt-hashed)
//   - patient Patient001 with a Greek full name and date of birth
// Never touches hospital.vitals (Cygnus-owned, read-only).
// Safe to run multiple times.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

async function main() {
  console.log('Initializing app tables in database "%s"...', process.env.DB_NAME || 'hospital');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      username      VARCHAR(64)  NOT NULL,
      password_hash VARCHAR(100) NOT NULL,
      full_name     VARCHAR(128) NOT NULL DEFAULT '',
      role          VARCHAR(32)  NOT NULL DEFAULT 'doctor',
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_app_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  - app_users table OK');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_patients (
      id            VARCHAR(64)  NOT NULL,
      full_name     VARCHAR(128) NOT NULL,
      date_of_birth DATE         NULL,
      gender        VARCHAR(16)  NULL,
      notes         VARCHAR(512) NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  - app_patients table OK');

  // Seed doctor account (idempotent: only insert if it doesn't exist).
  const [users] = await pool.query(
    'SELECT id FROM app_users WHERE username = ?',
    ['doctor']
  );
  if (users.length === 0) {
    const hash = await bcrypt.hash('doctor123', 10);
    await pool.query(
      'INSERT INTO app_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      ['doctor', hash, 'Δρ. Ελένη Παπαδοπούλου', 'doctor']
    );
    console.log('  - seeded user "doctor" (password: doctor123)');
  } else {
    console.log('  - user "doctor" already exists, skipping');
  }

  // Seed Patient001 (idempotent).
  const [patients] = await pool.query(
    'SELECT id FROM app_patients WHERE id = ?',
    ['Patient001']
  );
  if (patients.length === 0) {
    await pool.query(
      'INSERT INTO app_patients (id, full_name, date_of_birth, gender) VALUES (?, ?, ?, ?)',
      ['Patient001', 'Γεώργιος Αντωνίου', '1958-03-14', 'male']
    );
    console.log('  - seeded patient Patient001 (Γεώργιος Αντωνίου)');
  } else {
    console.log('  - patient Patient001 already exists, skipping');
  }

  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('init-db failed:', err.message);
  process.exit(1);
});
