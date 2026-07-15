/**
 * simulator-manager.js
 *
 * Lets the backend own the fiware-device-simulator as a child process:
 * regenerate the config from app_patients and restart the simulator,
 * so newly created patients start producing measurements automatically.
 *
 * Required .env variable:
 *     SIMULATOR_DIR=C:\path\to\fiware-device-simulator
 * Optional:
 *     SIMULATOR_CONFIG  (default: <SIMULATOR_DIR>\my-simulation.json)
 *     SIMULATOR_LOG     (default: <backend>\simulator.log)
 *
 * Usage in the backend:
 *     const simulator = require('./simulator-manager');
 *     simulator.start();                       // on backend startup
 *     await simulator.restart();               // after creating a patient
 */
require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { generateConfig } = require('./generate-simulation');

const SIMULATOR_DIR = process.env.SIMULATOR_DIR;
const CONFIG_PATH =
  process.env.SIMULATOR_CONFIG ||
  (SIMULATOR_DIR ? path.join(SIMULATOR_DIR, 'simulation.json') : null);
const LOG_PATH = process.env.SIMULATOR_LOG || path.join(__dirname, 'simulator.log');

let child = null;
let restarting = false;

function assertConfigured() {
  if (!SIMULATOR_DIR || !fs.existsSync(SIMULATOR_DIR)) {
    throw new Error(
      `SIMULATOR_DIR is not set or does not exist: "${SIMULATOR_DIR}". ` +
      'Set it in the backend .env to the fiware-device-simulator folder.'
    );
  }
  const cli = path.join(SIMULATOR_DIR, 'bin', 'fiwareDeviceSimulatorCLI');
  if (!fs.existsSync(cli)) {
    throw new Error(`Simulator CLI not found at ${cli} — is SIMULATOR_DIR correct?`);
  }
}

function spawnSimulator() {
  const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
  logStream.write(`\n--- simulator started ${new Date().toISOString()} ---\n`);

  child = spawn(
    process.execPath, // the same node binary running the backend
    [path.join('bin', 'fiwareDeviceSimulatorCLI'), '-c', CONFIG_PATH],
    { cwd: SIMULATOR_DIR, windowsHide: true }
  );
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.on('exit', (code, signal) => {
    logStream.write(`--- simulator exited (code=${code}, signal=${signal}) ---\n`);
    child = null;
  });
  console.log(`[simulator] running (pid ${child.pid}), log: ${LOG_PATH}`);
}

function stop() {
  return new Promise((resolve) => {
    if (!child) return resolve();
    const proc = child;
    child = null;
    proc.once('exit', () => resolve());
    proc.kill(); // SIGTERM; fiwareDeviceSimulatorCLI shuts down cleanly
    // Safety net: force-kill if still alive after 5s
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 5000);
  });
}

/** Regenerate config from app_patients and (re)start the simulator. */
async function restart() {
  if (restarting) return { skipped: true }; // ignore overlapping calls
  restarting = true;
  try {
    assertConfigured();
    const result = await generateConfig(CONFIG_PATH);
    await stop();
    spawnSimulator();
    console.log(`[simulator] restarted for patients: ${result.patients.join(', ')}`);
    return result;
  } finally {
    restarting = false;
  }
}

/** Start on backend boot (generates config first so it is always in sync). */
function start() {
  restart().catch((err) => console.error('[simulator] failed to start:', err.message));
}

// Stop the simulator when the backend exits
process.on('exit', () => { if (child) try { child.kill(); } catch {} });
process.on('SIGINT', () => process.exit(0));

module.exports = { start, stop, restart };