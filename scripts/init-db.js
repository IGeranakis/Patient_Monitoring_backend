// Idempotent database initialization.
// Creates the app-owned tables (app_users, app_patients) and seeds:
//   - doctor account:  username "doctor", password "doctor123" (bcrypt-hashed)
//   - patient Patient001 with a Greek full name and date of birth
// Also migrates existing installs: adds app_patients.created_by (the doctor
// who registered the patient) and backfills NULLs to the seeded doctor.
// Never touches hospital.vitals (Cygnus-owned, read-only).
// Safe to run multiple times.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const DB_NAME = process.env.DB_NAME || 'hospital';

async function main() {
  console.log('Initializing app tables in database "%s"...', DB_NAME);

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

  // Seed doctor account (idempotent: only insert if it doesn't exist).
  let doctorId;
  const [users] = await pool.query(
    'SELECT id FROM app_users WHERE username = ?',
    ['doctor']
  );
  if (users.length === 0) {
    const hash = await bcrypt.hash('doctor123', 10);
    const [result] = await pool.query(
      'INSERT INTO app_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      ['doctor', hash, 'Δρ. Ελένη Παπαδοπούλου', 'doctor']
    );
    doctorId = result.insertId;
    console.log('  - seeded user "doctor" (password: doctor123)');
  } else {
    doctorId = users[0].id;
    console.log('  - user "doctor" already exists, skipping');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_patients (
      id            VARCHAR(64)  NOT NULL,
      full_name     VARCHAR(128) NOT NULL,
      date_of_birth DATE         NULL,
      gender        VARCHAR(16)  NULL,
      notes         VARCHAR(512) NULL,
      created_by    INT UNSIGNED NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  - app_patients table OK');

  // Migration for installs created before patient ownership existed:
  // add the created_by column if it is missing.
  const [cols] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'app_patients' AND column_name = 'created_by'`,
    [DB_NAME]
  );
  if (cols[0].n === 0) {
    await pool.query('ALTER TABLE app_patients ADD COLUMN created_by INT UNSIGNED NULL');
    console.log('  - added app_patients.created_by column');
  }

  // Seed Patient001 (idempotent), owned by the seeded doctor.
  const [patients] = await pool.query(
    'SELECT id FROM app_patients WHERE id = ?',
    ['Patient001']
  );
  if (patients.length === 0) {
    await pool.query(
      `INSERT INTO app_patients (id, full_name, date_of_birth, gender, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      ['Patient001', 'Γεώργιος Αντωνίου', '1958-03-14', 'male', doctorId]
    );
    console.log('  - seeded patient Patient001 (Γεώργιος Αντωνίου)');
  } else {
    console.log('  - patient Patient001 already exists, skipping');
  }

  // Backfill: any patient without an owner belongs to the seeded doctor.
  const [backfill] = await pool.query(
    'UPDATE app_patients SET created_by = ? WHERE created_by IS NULL',
    [doctorId]
  );
  if (backfill.affectedRows > 0) {
    console.log(`  - assigned ${backfill.affectedRows} unowned patient(s) to "doctor"`);
  }

  console.log('Done.');
  await pool.end();
}

main().catch((err) => {
  console.error('init-db failed:', err.message);
  process.exit(1);
});
