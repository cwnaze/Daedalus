#!/usr/bin/env node
/**
 * Detect a pipeline that has stopped making progress, and restart or escalate it.
 *
 * "Stalled" = some story is non-terminal, no pipeline workflow is currently
 * running, and stories.json has not changed for STALL_MINUTES. All three must
 * hold: a long story is not a stalled story, which is why the check is anchored
 * to workflow activity rather than to elapsed time alone.
 *
 * Env: GH_TOKEN (PIPELINE_PAT), REPO, STALL_MINUTES, DRY_RUN
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const repo = process.env.REPO;
if (!repo) throw new Error('REPO is required');
const stallMinutes = Number(process.env.STALL_MINUTES ?? 90);
const dryRun = process.env.DRY_RUN === 'true';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const db = JSON.parse(fs.readFileSync('stories.json', 'utf8'));
const active = db.stories.filter((s) => ['in_progress', 'in_review', 'fixing'].includes(s.status));

if (!active.length) {
  // Nothing in flight. Hand off to the normal decision — this also covers the
  // case where a dispatch itself was lost and no story ever started.
  console.log('No story in flight; running the standard dispatch check.');
  process.exit(spawnDispatch());
}

// A pipeline workflow still running means the story is progressing, not stalled.
const runs = JSON.parse(
  sh('gh', ['api', `repos/${repo}/actions/runs?status=in_progress&per_page=100`]),
).workflow_runs.filter((r) => r.name !== 'pipeline-watchdog');

if (runs.length) {
  console.log(`Active runs: ${runs.map((r) => r.name).join(', ')}. Not stalled.`);
  process.exit(0);
}

// Last mutation of the state file is the pipeline's heartbeat: every transition
// commits it, so its age is the age of the last thing that actually happened.
const lastTouch = new Date(sh('git', ['log', '-1', '--format=%cI', '--', 'stories.json']));
const idleMinutes = Math.round((Date.now() - lastTouch.getTime()) / 60000);

if (idleMinutes < stallMinutes) {
  console.log(`Last transition ${idleMinutes}m ago (threshold ${stallMinutes}m). Not stalled.`);
  process.exit(0);
}

const story = active[0];
console.log(`STALLED: ${story.id} is ${story.status}, idle ${idleMinutes}m, no runs active.`);

if (dryRun) {
  console.log('[dry run] stopping here.');
  process.exit(0);
}

if (story.status === 'in_progress') {
  // implement-story has crash-resume logic for exactly this: it finds the
  // non-terminal story, reconciles it against any open PR, and continues.
  // Nothing invoked that logic until this workflow existed.
  sh('gh', ['api', `repos/${repo}/dispatches`, '-f', 'event_type=story-start']);
  console.log(`Re-dispatched story-start to resume ${story.id}.`);
  process.exit(0);
}

// in_review / fixing means a PR exists. Re-running review is not ours to guess
// at — pushing a commit or reopening the PR would fabricate history — so
// escalate rather than act.
const note =
  `Pipeline watchdog: **${story.id}** has been \`${story.status}\` for ${idleMinutes} minutes ` +
  `with no workflow running.\n\nPR #${story.prNumber ?? '?'} likely needs its review re-run — ` +
  `push an empty commit to the branch to re-trigger \`pr-review\`, or close and reopen the PR.`;

try {
  if (story.prNumber) {
    sh('gh', ['pr', 'comment', String(story.prNumber), '--repo', repo, '--body', note]);
    sh('gh', ['pr', 'edit', String(story.prNumber), '--repo', repo, '--add-label', 'needs-human']);
  } else {
    sh('gh', ['issue', 'create', '--repo', repo, '--title', `Pipeline stalled: ${story.id}`, '--label', 'needs-human', '--body', note]);
  }
  console.log('Escalated to needs-human.');
} catch (e) {
  console.error(`Could not escalate: ${e.message}`);
  process.exit(1);
}

function spawnDispatch() {
  try {
    console.log(execFileSync('node', ['.github/scripts/dispatch-next.mjs'], { encoding: 'utf8' }));
    return 0;
  } catch (e) {
    console.error(e.stdout ?? e.message);
    return 1;
  }
}
