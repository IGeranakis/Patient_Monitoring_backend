require('dotenv').config();
const app = require('./app');

const PORT = Number(process.env.PORT) || 4000;

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Copy .env.example to .env and edit it.');
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`Health check:     http://localhost:${PORT}/api/health`);
});
