import fs from 'node:fs';
import path from 'node:path';

// Playwright's test process is plain Node — unlike `next dev`, it does not
// auto-load `.env`. We need DATABASE_URL here to talk to Postgres directly
// (via Prisma) for DB-truth assertions, so parse the repo's .env by hand
// (no dotenv dependency in package.json) and merge it into process.env
// without clobbering anything already set by the shell/CI.
function loadDotEnvOnce() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnvOnce();
