// Read-only data access for hospital.vitals (populated by FIWARE Cygnus).
// Entity naming convention: <PatientId>:<DeviceType>, e.g. "Patient001:Oximeter".
// attrValue is TEXT; numeric readings have attrType = 'Number' and are cast
// to Number before being returned to callers.
const pool = require('../config/db');

/**
 * Newest value of each numeric vital across all the patient's devices.
 * Returns an array of:
 *   { attrName, value (Number), deviceType, entityId, recvTime, recvTimeTs }
 */
async function getLatestVitals(patientId) {
  const [rows] = await pool.query(
    `SELECT v.attrName, v.attrValue, v.entityId, v.recvTime, v.recvTimeTs
     FROM vitals v
     INNER JOIN (
       SELECT attrName, MAX(recvTimeTs) AS maxTs
       FROM vitals
       WHERE entityId LIKE CONCAT(?, ':%')
         AND attrType = 'Number'
       GROUP BY attrName
     ) latest
       ON v.attrName = latest.attrName
      AND v.recvTimeTs = latest.maxTs
     WHERE v.entityId LIKE CONCAT(?, ':%')
       AND v.attrType = 'Number'
     ORDER BY v.attrName`,
    [patientId, patientId]
  );

  // Deduplicate defensively (identical recvTimeTs for the same attrName
  // would produce two rows) and cast values to Number.
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    if (seen.has(row.attrName)) continue;
    seen.add(row.attrName);
    result.push({
      attrName: row.attrName,
      value: Number(row.attrValue),
      deviceType: row.entityId.split(':')[1] || null,
      entityId: row.entityId,
      recvTime: row.recvTime,
      recvTimeTs: Number(row.recvTimeTs)
    });
  }
  return result;
}

/**
 * Time series of one numeric attribute for a patient: the most recent
 * `limit` measurements, returned OLDEST-FIRST, values cast to Number.
 */
async function getHistory(patientId, attrName, limit) {
  const [rows] = await pool.query(
    `SELECT attrValue, recvTime, recvTimeTs
     FROM vitals
     WHERE entityId LIKE CONCAT(?, ':%')
       AND attrName = ?
       AND attrType = 'Number'
     ORDER BY recvTimeTs DESC
     LIMIT ?`,
    [patientId, attrName, limit]
  );

  // Rows come newest-first; reverse so the series is oldest-first.
  return rows.reverse().map((row) => ({
    value: Number(row.attrValue),
    recvTime: row.recvTime,
    recvTimeTs: Number(row.recvTimeTs)
  }));
}

/**
 * True if the patient has at least one row in vitals (any attribute).
 */
async function hasData(patientId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM vitals WHERE entityId LIKE CONCAT(?, ':%') LIMIT 1`,
    [patientId]
  );
  return rows.length > 0;
}

module.exports = { getLatestVitals, getHistory, hasData };
