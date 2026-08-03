#!/usr/bin/env node
/**
 * Structural validation of stories.json.
 *
 * Everything here is a defect that planning introduced but that only surfaces in
 * the pipeline as confusing behaviour rather than as an error. A dependsOn cycle is
 * the clearest case: the dispatcher correctly reports "no eligible story and
 * nothing running", which is true, unhelpful, and names the symptom instead of
 * the cause.
 *
 * Usage: node validate-stories.mjs [path]   (default ./stories.json)
 * Exit 1 on any error. Warnings do not fail.
 */
import fs from 'node:fs';

const path = process.argv[2] ?? 'stories.json';
const STATUSES = ['pending', 'in_progress', 'in_review', 'fixing', 'blocked', 'needs_human', 'done'];
const NON_TERMINAL = ['in_progress', 'in_review', 'fixing'];

const errors = [];
const warnings = [];

let db;
try {
  db = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`${path}: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(db.stories)) {
  console.error(`${path}: "stories" must be an array.`);
  process.exit(1);
}

const ids = new Set();
for (const [i, s] of db.stories.entries()) {
  const at = `stories[${i}]${s.id ? ` (${s.id})` : ''}`;
  if (!s.id) errors.push(`${at}: missing id`);
  else if (ids.has(s.id)) errors.push(`${at}: duplicate id`);
  else ids.add(s.id);

  if (!STATUSES.includes(s.status)) errors.push(`${at}: status ${JSON.stringify(s.status)} is not one of ${STATUSES.join(', ')}`);
  if (!s.title) warnings.push(`${at}: no title`);
  if (!Array.isArray(s.acceptanceCriteria) || !s.acceptanceCriteria.length) warnings.push(`${at}: no acceptance criteria`);
  if (!Array.isArray(s.dependsOn)) errors.push(`${at}: dependsOn must be an array`);

  // The schema calls specs mandatory for browser stories because they are what
  // generates the demo and what the regression suite is made of. A browser story
  // without one is invisible to every later review.
  if (s.demoKind === 'browser' && !s.verification?.specs?.length) {
    errors.push(`${at}: demoKind "browser" requires at least one verification.specs entry`);
  }
  if (s.repo && db.repos && !db.repos[s.repo]) errors.push(`${at}: repo "${s.repo}" is not in the top-level repos map`);
}

for (const s of db.stories) {
  for (const d of s.dependsOn ?? []) {
    if (!ids.has(d)) errors.push(`${s.id}: dependsOn "${d}" does not exist`);
  }
}

// Cycle detection: iteratively strip stories whose dependencies are all
// resolvable. Whatever will not strip is in, or behind, a cycle — which is
// exactly the set that can never become eligible.
{
  const remaining = new Map(db.stories.map((s) => [s.id, new Set((s.dependsOn ?? []).filter((d) => ids.has(d)))]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, deps] of remaining) {
      if (deps.size === 0) {
        remaining.delete(id);
        for (const other of remaining.values()) other.delete(id);
        changed = true;
      }
    }
  }
  if (remaining.size) {
    errors.push(`dependsOn cycle — these can never become eligible: ${[...remaining.keys()].join(', ')}`);
  }
}

const active = db.stories.filter((s) => NON_TERMINAL.includes(s.status));
if (active.length > 1) {
  errors.push(`${active.length} stories are non-terminal at once (${active.map((s) => s.id).join(', ')}); the invariant is one`);
}

// Split-repo projects need a spine, and only the spine may carry this file.
if (db.repos && Object.keys(db.repos).length > 1 && !db.spineRepo) {
  errors.push('multi-repo project has no spineRepo set');
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);

if (errors.length) {
  console.error(`\n${path}: ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`${path}: ${db.stories.length} stories, valid${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
