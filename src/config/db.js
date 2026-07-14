// MySQL connection pool (mysql2/promise).
// The pool is shared by the whole app; connections are released automatically
// when using pool.query()/pool.execute().
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'hospital',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Cygnus stores timestamps as DATETIME text; return them as strings
  // so we can format them explicitly instead of relying on JS Date/timezone.
  dateStrings: true
});

module.exports = pool;
