#!/usr/bin/env node
/**
 * Derive a pipeline.json from a repository by looking at it.
 *
 * Nothing here is specific to a project or a stack. It reads the marker files
 * every ecosystem already has — package.json, pyproject.toml, go.mod, Cargo.toml,
 * Gemfile, pom.xml — and reports what it found plus what it could not determine.
 *
 * The output is a *proposal*, not an answer. Detection cannot know that `npm run
 * build` is the wrong build for this repo, so codebase-inventory shows the
 * proposal to the user for confirmation before anything is committed.
 *
 *   node detect-stack.mjs [repo-dir]            proposed pipeline.json on stdout
 *   node detect-stack.mjs [repo-dir] --report   human-readable findings on stderr
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const report = process.argv.includes('--report');

const has = (p) => fs.existsSync(path.join(root, p));
const read = (p) => {
  try {
    return fs.readFileSync(path.join(root, p), 'utf8');
  } catch {
    return null;
  }
};
const readJson = (p) => {
  try {
    return JSON.parse(read(p) ?? '');
  } catch {
    return null;
  }
};

const notes = [];
const unknown = [];

/* ---------------------------------------------------------------- runtime */

// Ordered by specificity, not popularity: a repo with both package.json and
// go.mod is a Go service with a JS frontend more often than the reverse, but
// either way the user confirms.
const RUNTIMES = [
  { runtime: 'node', marker: 'package.json' },
  { runtime: 'python', marker: 'pyproject.toml' },
  { runtime: 'python', marker: 'requirements.txt' },
  { runtime: 'python', marker: 'setup.py' },
  { runtime: 'go', marker: 'go.mod' },
  { runtime: 'rust', marker: 'Cargo.toml' },
  { runtime: 'ruby', marker: 'Gemfile' },
  { runtime: 'java', marker: 'pom.xml' },
  { runtime: 'java', marker: 'build.gradle' },
  { runtime: 'java', marker: 'build.gradle.kts' },
  { runtime: 'dotnet', marker: 'global.json' },
];

const found = RUNTIMES.filter((r) => has(r.marker));
if (found.length > 1) {
  notes.push(
    `Multiple runtimes present (${[...new Set(found.map((f) => f.marker))].join(', ')}). ` +
      `Proposing ${found[0].runtime}; if this is a split frontend/backend repo, say so — ` +
      `the pipeline wants one runtime per repo.`,
  );
}
if (!found.length) unknown.push('runtime — no recognized manifest file at the repo root');

const runtime = found[0]?.runtime ?? 'none';
const existsWhen = found[0]?.marker ?? '';

/* ---------------------------------------------------------------- version */

let version = '';
const pkg = readJson('package.json');
const nvmrc = read('.nvmrc');
const pyproject = read('pyproject.toml');
const goMod = read('go.mod');

if (runtime === 'node') {
  version = (nvmrc?.trim().replace(/^v/, '') || pkg?.engines?.node?.match(/(\d+)/)?.[1] || '').trim();
} else if (runtime === 'python') {
  version = read('.python-version')?.trim() || pyproject?.match(/requires-python\s*=\s*"[^0-9]*([\d.]+)/)?.[1] || '';
} else if (runtime === 'go') {
  version = goMod?.match(/^go\s+([\d.]+)/m)?.[1] ?? '';
} else if (runtime === 'ruby') {
  version = read('.ruby-version')?.trim() || read('Gemfile')?.match(/ruby ['"]([\d.]+)/)?.[1] || '';
} else if (runtime === 'java') {
  version = read('pom.xml')?.match(/<java\.version>([\d.]+)/)?.[1] ?? '';
}
if (!version) unknown.push(`${runtime} version — no version file found; pick one deliberately`);

/* ------------------------------------------------- install and commands */

// Prefer the lockfile-accurate install; fall back to the loose one.
const INSTALL = {
  node: has('package-lock.json')
    ? 'npm ci'
    : has('pnpm-lock.yaml')
      ? 'pnpm install --frozen-lockfile'
      : has('yarn.lock')
        ? 'yarn install --frozen-lockfile'
        : 'npm install',
  python: has('poetry.lock')
    ? 'poetry install'
    : has('requirements.txt')
      ? 'pip install -r requirements.txt'
      : 'pip install -e .',
  go: 'go mod download',
  rust: 'cargo fetch',
  ruby: 'bundle install',
  java: has('mvnw') ? './mvnw -B dependency:go-offline' : has('gradlew') ? './gradlew dependencies' : 'mvn -B dependency:go-offline',
  dotnet: 'dotnet restore',
  none: '',
};

const commands = { typecheck: '', lint: '', build: '', test: '' };

if (runtime === 'node' && pkg?.scripts) {
  // Map by intent, taking the first script that exists. Never invent one:
  // a declared command that does not exist fails every CI run.
  const pick = (...names) => names.find((n) => pkg.scripts[n]);
  const runner = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm run';
  const t = pick('typecheck', 'check', 'tsc');
  const l = pick('lint', 'eslint');
  const b = pick('build', 'compile');
  const s = pick('test', 'test:unit');
  if (t) commands.typecheck = `${runner} ${t}`;
  if (l) commands.lint = `${runner} ${l}`;
  if (b) commands.build = `${runner} ${b}`;
  if (s) commands.test = `${runner} ${s}`;
  for (const [k, v] of Object.entries({ typecheck: t, lint: l, build: b, test: s })) {
    if (!v) notes.push(`No "${k}" script in package.json — left empty, which means CI skips it.`);
  }
} else if (runtime === 'python') {
  if (has('mypy.ini') || pyproject?.includes('[tool.mypy]')) commands.typecheck = 'mypy .';
  if (has('ruff.toml') || pyproject?.includes('[tool.ruff]')) commands.lint = 'ruff check .';
  else if (has('.flake8') || has('setup.cfg')) commands.lint = 'flake8';
  if (has('manage.py')) commands.test = 'python manage.py test';
  else if (pyproject?.includes('pytest') || has('pytest.ini') || has('tests')) commands.test = 'pytest -q';
} else if (runtime === 'go') {
  commands.typecheck = 'go vet ./...';
  commands.build = 'go build ./...';
  commands.test = 'go test ./...';
  if (has('.golangci.yml') || has('.golangci.yaml')) commands.lint = 'golangci-lint run';
} else if (runtime === 'rust') {
  commands.typecheck = 'cargo check';
  commands.lint = 'cargo clippy -- -D warnings';
  commands.build = 'cargo build --release';
  commands.test = 'cargo test';
} else if (runtime === 'ruby') {
  if (has('.rubocop.yml')) commands.lint = 'bundle exec rubocop';
  commands.test = has('spec') ? 'bundle exec rspec' : 'bundle exec rake test';
} else if (runtime === 'java') {
  const w = has('mvnw') ? './mvnw -B' : has('gradlew') ? './gradlew' : 'mvn -B';
  commands.build = w.includes('gradle') ? `${w} build -x test` : `${w} package -DskipTests`;
  commands.test = `${w} test`;
}

// A Makefile often overrides all of the above, and is worth surfacing rather
// than silently ignoring.
const makefile = read('Makefile');
if (makefile) {
  const targets = [...makefile.matchAll(/^([a-zA-Z][\w-]*):/gm)].map((m) => m[1]);
  const interesting = targets.filter((t) => ['build', 'test', 'lint', 'check', 'typecheck', 'ci'].includes(t));
  if (interesting.length) {
    notes.push(`Makefile defines ${interesting.map((t) => `make ${t}`).join(', ')} — these may be the real entry points; prefer them if so.`);
  }
}

/* ------------------------------------------------------------------ serve */

let serve = null;
const WEB_HINTS = [
  ['next.config.js', 3000], ['next.config.mjs', 3000], ['next.config.ts', 3000],
  ['vite.config.js', 5173], ['vite.config.ts', 5173],
  ['svelte.config.js', 5173], ['nuxt.config.ts', 3000],
  ['manage.py', 8000], ['config.ru', 3000], ['Procfile', 8080],
];
const webHint = WEB_HINTS.find(([f]) => has(f));

if (runtime === 'node' && pkg?.scripts) {
  const dev = ['dev', 'start', 'serve'].find((n) => pkg.scripts[n]);
  const preview = ['preview', 'start'].find((n) => pkg.scripts[n]);
  const runner = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm run';
  if (dev) {
    serve = {
      ci: commands.build && preview ? `${commands.build} && ${runner} ${preview}` : `${runner} ${dev}`,
      dev: `${runner} ${dev}`,
      url: `http://localhost:${webHint?.[1] ?? 3000}`,
    };
  }
} else if (has('manage.py')) {
  serve = {
    ci: 'python manage.py runserver 0.0.0.0:8000 --noreload',
    dev: 'python manage.py runserver 8000',
    url: 'http://localhost:8000',
  };
} else if (webHint) {
  unknown.push(`serve commands — this looks like a web project (${webHint[0]}) but the start command could not be derived`);
}

if (!serve && !webHint) {
  notes.push('No web surface detected. Stories will use demoKind "command"; omit `serve` unless that is wrong.');
}

/* --------------------------------------------------------------- services */

const services = has('docker-compose.yml') || has('compose.yml') ? 'docker compose up -d --wait' : null;

/* ------------------------------------------------------- existing tests */

const TEST_DIRS = ['test', 'tests', 'spec', '__tests__', 'e2e', 'cypress'];
const testDirs = TEST_DIRS.filter((d) => has(d));
if (testDirs.length) notes.push(`Existing tests in ${testDirs.join(', ')} — these are the starting safety net; do not replace them, add characterization specs alongside.`);
else notes.push('No test directory found. Characterization specs are the entire safety net for this refactor; sequence them first.');

if (has('.github/workflows')) {
  const wf = fs.readdirSync(path.join(root, '.github/workflows'));
  notes.push(`Existing GitHub Actions workflows: ${wf.join(', ')}. The pipeline adds its own; check for name collisions before bootstrapping.`);
}

/* ----------------------------------------------------------------- output */

const manifest = { runtime, version, install: INSTALL[runtime] ?? '', commands, serve, services, existsWhen };

if (report) {
  console.error(`Detected runtime : ${runtime}${version ? ` ${version}` : ''}`);
  console.error(`Install          : ${manifest.install || '(none)'}`);
  for (const [k, v] of Object.entries(commands)) console.error(`${k.padEnd(17)}: ${v || '(none detected)'}`);
  console.error(`Serve            : ${serve ? `${serve.ci} @ ${serve.url}` : '(no web surface detected)'}`);
  console.error(`Services         : ${services ?? '(none)'}`);
  if (notes.length) {
    console.error('\nNotes:');
    for (const n of notes) console.error(`  - ${n}`);
  }
  if (unknown.length) {
    console.error('\nCould NOT determine — ask the user, do not guess:');
    for (const u of unknown) console.error(`  - ${u}`);
  }
}

console.log(JSON.stringify(manifest, null, 2));
