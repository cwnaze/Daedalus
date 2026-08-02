#!/usr/bin/env node
/**
 * Materialize .env in CI from repo secrets.
 *
 * .env.example is the contract in both directions: it lists every variable the
 * project needs, `scripts/sync-secrets.sh` pushes those keys up from your local
 * .env, and this script pulls them back down into the runner. A variable missing
 * from .env.example is invisible to CI — which is the failure this design makes loud
 * rather than silent.
 */
import fs from 'node:fs';

if (!fs.existsSync('.env.example')) {
  console.log('No .env.example — nothing to materialize.');
  process.exit(0);
}

const secrets = JSON.parse(process.env.ALL_SECRETS ?? '{}');
const keys = fs
  .readFileSync('.env.example', 'utf8')
  .split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1])
  .filter(Boolean);

const lines = [];
const missing = [];
for (const k of keys) {
  if (secrets[k] !== undefined) lines.push(`${k}=${secrets[k]}`);
  else missing.push(k);
}

fs.writeFileSync('.env', lines.join('\n') + '\n');
console.log(`Wrote .env with ${lines.length} variable(s).`);

if (missing.length) {
  // Not fatal: some variables are optional or only used in production.
  // The reviewing agent needs to know, because a "feature broken" finding that
  // is really a missing secret wastes a full review round.
  console.log(`::warning::Missing repo secrets for: ${missing.join(', ')}`);
}
