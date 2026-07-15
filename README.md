# Backend — Remote Patient Monitoring API

Node.js + Express REST API that reads vital-sign measurements persisted by
FIWARE Cygnus into MySQL (`hospital.vitals`, read-only) and manages its own
`app_`-prefixed tables (`app_users`, `app_patients`) in the same database.

## Requirements

- Node.js 18+ (`node --version` to check)
- The FIWARE Docker stack running, with MySQL exposed on `localhost:3307`

## Setup & run (Windows 11, PowerShell)

All commands from the `backend` folder:

```powershell
cd "C:\Users\igeran\Desktop\Hospitals App\backend"
```

**1. Install dependencies**

```powershell
npm install
```

**2. Create your .env**

```powershell
Copy-Item .env.example .env
```

Then open `.env` and set `JWT_SECRET` to a long random string, e.g. generate one with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The MySQL values in `.env.example` already match your Docker setup
(localhost:3307, root/secret, db `hospital`). Verify MySQL is reachable:

```powershell
docker ps --filter "publish=3307"
```

**3. Initialize the app tables (idempotent — safe to re-run)**

```powershell
npm run init-db
```

Creates `app_users` and `app_patients`, seeds the `doctor` account
(password `doctor123`) and patient `Patient001` (Γεώργιος Αντωνίου).

**4. Start the API**

```powershell
npm start
```

The API listens on http://localhost:4000. For auto-restart on file changes
during development use `npm run dev` instead.

## Quick test (PowerShell)

```powershell
# Health (no auth)
Invoke-RestMethod http://localhost:4000/api/health

# Login -> capture token
$login = Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/login `
  -ContentType "application/json" -Body '{"username":"doctor","password":"doctor123"}'
$headers = @{ Authorization = "Bearer $($login.token)" }

# Patients
Invoke-RestMethod http://localhost:4000/api/patients -Headers $headers

# Latest vitals for Patient001
Invoke-RestMethod http://localhost:4000/api/patients/Patient001/latest -Headers $headers

# Heart-rate history (last 10 points, oldest-first)
Invoke-RestMethod "http://localhost:4000/api/patients/Patient001/history?attr=heartRate&limit=10" -Headers $headers
```

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | `{username, password}` → `{token, user}` |
| GET | `/api/health` | — | Liveness + DB connectivity |
| GET | `/api/patients` | Bearer | The logged-in doctor's patients (`created_by` scoped) |
| GET | `/api/patients/:id/latest` | Bearer | Newest value of each numeric vital (all devices) |
| GET | `/api/patients/:id/history?attr=heartRate&limit=100` | Bearer | Time series of one attribute, oldest-first, numeric values (limit 1–1000, default 100) |
| POST | `/api/patients` | Bearer | Create patient `{fullName, dateOfBirth?, gender?, notes?}` — id auto-generated (PatientNNN) |
| PUT | `/api/patients/:id` | Bearer | Update patient (id immutable) |
| DELETE | `/api/patients/:id` | Bearer | Delete patient (vitals data untouched) |
| GET | `/api/users` | Bearer | All doctor accounts (no password hashes) |
| POST | `/api/users` | Bearer | Create doctor `{username, password, fullName}` |
| PUT | `/api/users/:id` | Bearer | Update doctor `{fullName?, password?}` (username immutable) |
| DELETE | `/api/users/:id` | Bearer | Delete doctor (cannot delete own account) |

Attribute names for `?attr=`: `systolicPressure`, `diastolicPressure`,
`oxygenSaturation`, `pulseRate`, `heartRate`, `rrInterval`.

## Project structure

```
backend/
├── package.json
├── .env.example
├── scripts/
│   └── init-db.js            # idempotent table creation + seeding
└── src/
    ├── server.js             # entry point
    ├── app.js                # Express app, CORS, health, error handling
    ├── config/db.js          # mysql2 connection pool
    ├── middleware/auth.js    # JWT Bearer verification
    ├── models/               # SQL (parameterized everywhere)
    │   ├── userModel.js
    │   ├── patientModel.js
    │   └── vitalsModel.js    # read-only queries on hospital.vitals
    ├── controllers/
    │   ├── authController.js
    │   └── patientController.js
    └── routes/
        ├── authRoutes.js
        └── patientRoutes.js
```

## Notes

- `hospital.vitals` is treated strictly read-only; the app never writes to
  or alters it. All app-owned tables are prefixed `app_`.
- `attrValue` is TEXT in MySQL; the API casts numeric readings
  (`attrType = 'Number'`) to JS numbers before responding.
- Patients and devices are always derived from `app_patients` and the
  `<PatientId>:<DeviceType>` entityId convention — nothing is hardcoded
  to Patient001.
- **Patient ownership:** every patient row stores `created_by` (the doctor
  who registered it). All patient endpoints are scoped to the logged-in
  doctor; another doctor's patients return 404. `npm run init-db` migrates
  older installs (adds the column, assigns unowned patients to `doctor`).
  A doctor account that still owns patients cannot be deleted.
# Patient_Monitoring_backend
