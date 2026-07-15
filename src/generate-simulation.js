/**
 * generate-simulation.js
 *
 * Generates a fiware-device-simulator configuration with 3 virtual devices
 * (BloodPressureMonitor, Oximeter, Holter) for EVERY patient found in
 * hospital.app_patients.
 *
 * Use from the command line:
 *     node generate-simulation.js [output-path]
 * Or from code:
 *     const { generateConfig } = require('./generate-simulation');
 *     await generateConfig('C:/path/to/my-simulation.json');
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const SCHEDULE = '*/5 * * * * *'; // every 5 seconds

// Attribute value generators (validated against the simulator)
const GEN = {
  systolic:
    'time-random-linear-interpolator({"spec": [[0,random(100,115)],[8,random(110,130)],[14,random(115,135)],[20,random(110,125)],[24,random(100,115)]], "return": {"type": "integer", "rounding": "round"}})',
  diastolic:
    'time-random-linear-interpolator({"spec": [[0,random(60,70)],[8,random(70,85)],[14,random(72,88)],[20,random(68,82)],[24,random(60,70)]], "return": {"type": "integer", "rounding": "round"}})',
  spo2:
    'time-random-linear-interpolator({"spec": [[0,random(94,98)],[12,random(95,99)],[24,random(94,98)]], "return": {"type": "integer", "rounding": "round"}})',
  pulse:
    'time-random-linear-interpolator({"spec": [[0,random(55,70)],[8,random(65,90)],[14,random(70,95)],[22,random(60,80)],[24,random(55,70)]], "return": {"type": "integer", "rounding": "round"}})',
  heartRate:
    'time-random-linear-interpolator({"spec": [[0,random(50,65)],[7,random(60,85)],[13,random(70,100)],[21,random(60,80)],[24,random(50,65)]], "return": {"type": "integer", "rounding": "round"}})',
  rrInterval:
    'time-random-linear-interpolator({"spec": [[0,random(0.85,1.10)],[12,random(0.65,0.90)],[24,random(0.85,1.10)]], "return": {"type": "float"}})',
  now: 'date-increment-interpolator({"origin": "now", "increment": 0})',
};

function devicesForPatient(patientId) {
  const staticAttrs = (deviceType) => [
    { name: 'patientId', type: 'Text', value: patientId },
    { name: 'deviceType', type: 'Text', value: deviceType },
  ];
  const timeAttr = { name: 'timeInstant', type: 'DateTime', value: GEN.now };

  return [
    {
      schedule: SCHEDULE,
      entity_name: `${patientId}:BloodPressureMonitor`,
      entity_type: 'BloodPressureMonitor',
      staticAttributes: staticAttrs('sphygmomanometer'),
      active: [
        { name: 'systolicPressure', type: 'Number', value: GEN.systolic },
        { name: 'diastolicPressure', type: 'Number', value: GEN.diastolic },
        timeAttr,
      ],
    },
    {
      schedule: SCHEDULE,
      entity_name: `${patientId}:Oximeter`,
      entity_type: 'Oximeter',
      staticAttributes: staticAttrs('pulse-oximeter'),
      active: [
        { name: 'oxygenSaturation', type: 'Number', value: GEN.spo2 },
        { name: 'pulseRate', type: 'Number', value: GEN.pulse },
        timeAttr,
      ],
    },
    {
      schedule: SCHEDULE,
      entity_name: `${patientId}:Holter`,
      entity_type: 'Holter',
      staticAttributes: staticAttrs('holter-monitor'),
      active: [
        { name: 'heartRate', type: 'Number', value: GEN.heartRate },
        { name: 'rrInterval', type: 'Number', value: GEN.rrInterval },
        timeAttr,
      ],
    },
  ];
}

async function generateConfig(outPath) {
  const resolved = path.resolve(outPath || 'simulation.json');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'secret',
    database: process.env.DB_NAME || 'hospital',
  });

  const [patients] = await pool.query('SELECT id FROM app_patients ORDER BY id');
  await pool.end();

  if (patients.length === 0) {
    throw new Error('No patients found in app_patients — nothing to generate.');
  }

  const config = {
    domain: { service: 'hospital', subservice: '/vitals' },
    contextBroker: {
      protocol: 'http',
      host: 'localhost',
      port: 1026,
      ngsiVersion: '2.0',
    },
    entities: patients.flatMap((p) => devicesForPatient(p.id)),
  };

  fs.writeFileSync(resolved, JSON.stringify(config, null, 2));
  return { path: resolved, patients: patients.map((p) => p.id) };
}

module.exports = { generateConfig };

// CLI mode
if (require.main === module) {
  generateConfig(process.argv[2])
    .then((r) => {
      console.log(`Generated ${r.path} for ${r.patients.length} patient(s): ${r.patients.join(', ')}`);
      console.log('Now (re)start the simulator with this file.');
    })
    .catch((err) => { console.error(err.message); process.exit(1); });
}