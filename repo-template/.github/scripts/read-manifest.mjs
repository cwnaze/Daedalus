#!/usr/bin/env node
/**
 * Read pipeline.json and emit it as GitHub Actions step outputs.
 *
 * This is the single place that knows the manifest's shape. Workflows consume
 * outputs, so adding a field does not mean editing seven YAML files, and a
 * malformed manifest fails here with a sentence rather than three steps later
 * as an unbound variable.
 *
 *   node read-manifest.mjs            key=value lines for $GITHUB_OUTPUT
 *   node read-manifest.mjs --print    human-readable summary for the log
 *   node read-manifest.mjs --get serve.ci
 */
import fs from 'node:fs';

const RUNTIMES = ['node', 'python', 'go', 'ruby', 'java', 'dotnet', 'rust', 'none'];

let m;
try {
  m = JSON.parse(fs.readFileSync('pipeline.json', 'utf8'));
} catch (e) {
  console.error(`pipeline.json: ${e.message}`);
  process.exit(1);
}

const runtime = m.runtime ?? 'none';
if (!RUNTIMES.includes(runtime)) {
  console.error(`pipeline.json: runtime "${runtime}" is not one of ${RUNTIMES.join(', ')}`);
  process.exit(1);
}

// A project exists once its manifest file does. Defaulting per runtime means a
// hand-written manifest does not have to spell this out.
const DEFAULT_MARKER = {
  node: 'package.json',
  python: 'pyproject.toml',
  go: 'go.mod',
  ruby: 'Gemfile',
  java: 'pom.xml',
  dotnet: '',
  rust: 'Cargo.toml',
  none: '',
};
const existsWhen = m.existsWhen ?? DEFAULT_MARKER[runtime];
const scaffolded = !existsWhen || fs.existsSync(existsWhen);

const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), m);

if (process.argv.includes('--get')) {
  const key = process.argv[process.argv.indexOf('--get') + 1];
  const v = get(key);
  if (v == null) process.exit(1);
  console.log(String(v));
  process.exit(0);
}

const out = {
  runtime,
  version: String(m.version ?? ''),
  install: m.install ?? '',
  services: m.services ?? '',
  exists_when: existsWhen ?? '',
  scaffolded: String(scaffolded),
  serve_ci: m.serve?.ci ?? '',
  serve_dev: m.serve?.dev ?? '',
  serve_url: m.serve?.url ?? '',
  cmd_typecheck: m.commands?.typecheck ?? '',
  cmd_lint: m.commands?.lint ?? '',
  cmd_build: m.commands?.build ?? '',
  cmd_test: m.commands?.test ?? '',
};

if (process.argv.includes('--print')) {
  for (const [k, v] of Object.entries(out)) if (v) console.log(`  ${k.padEnd(14)} ${v}`);
  process.exit(0);
}

for (const [k, v] of Object.entries(out)) {
  // Multi-line values would corrupt $GITHUB_OUTPUT's key=value format.
  if (String(v).includes('\n')) {
    console.error(`pipeline.json: "${k}" must be a single line`);
    process.exit(1);
  }
  console.log(`${k}=${v}`);
}
