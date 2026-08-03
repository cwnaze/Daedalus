#!/usr/bin/env node
/**
 * Detect a pipeline that has stopped making progress, and restart or escalate it.
 *
 * "Stalled" = some story is non-terminal, no pipeline workflow is currently
 * running, and stories.json has not changed for STALL_MINUTES. All three must
 * hold: a long story is not a stalled story, which is why the check is anchored
 * to workflow activity rather than to elapsed time alone.
 *
 * Auth is a Claude subscription OAuth token, so the pipeline shares one quota with
 * everything else that token runs. Exhausting it looks exactly like a stall — the run
 * dies, no event follows — and the naive response, re-dispatching, spends the quota
 * that is already gone. So every dispatch below is gated on quotaBlocked().
 *
 * Env: GH_TOKEN (PIPELINE_PAT), REPO, STALL_MINUTES, DRY_RUN
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const repo = process.env.REPO;
if (!repo) throw new Error('REPO is required');
const stallMinutes = Number(process.env.STALL_MINUTES ?? 90);
const dryRun = process.env.DRY_RUN === 'true';
// Claude subscription quota refills on a rolling window. Used only when the failure
// text names no explicit reset time.
const windowHours = Number(process.env.QUOTA_WINDOW_HOURS ?? 5);

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

/**
 * Did the last Claude-backed run die on quota, and is that window still closed?
 *
 * There is no way to ask "how much quota is left" from CI — `/usage` is an in-session
 * slash command, not a CLI subcommand — so this reads the evidence after the fact
 * instead. That turns out to be the better signal anyway: it reports what actually
 * happened rather than what a prediction says should have.
 *
 * Self-correcting by construction. Nothing is recorded; each hourly tick re-reads the
 * same failed run and re-evaluates the deadline, so the pipeline resumes on the first
 * tick after the window opens and stays quiet until then.
 *
 * @returns {Date|null} when the quota is expected back, or null if this is not a
 *   quota failure at all.
 */
function rateLimitedUntil() {
  const claudeWorkflows = ['story-start', 'pr-review', 'pr-fix', 'production-prep'];
  let last;
  try {
    last = JSON.parse(
      sh('gh', ['api', `repos/${repo}/actions/runs?status=completed&per_page=20`]),
    ).workflow_runs
      .filter((r) => claudeWorkflows.includes(r.name))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
  } catch (e) {
    console.error(`Could not list runs (${e.message}); assuming no rate limit.`);
    return null;
  }
  if (!last || last.conclusion === 'success') return null;

  let log = '';
  try {
    log = sh('gh', ['run', 'view', String(last.id), '--repo', repo, '--log-failed']);
  } catch (e) {
    // Logs expire, and a run cancelled before producing any are normal. Either way
    // there is nothing to match, so fall through to the ordinary stall handling.
    console.error(`Could not read logs for run ${last.id}: ${e.message}`);
    return null;
  }

  if (!/usage limit reached|rate[ _-]?limit|quota exceeded|429/i.test(log)) return null;

  // Claude reports its own reset time when it knows it ("limit will reset at 3pm",
  // or an epoch). Prefer that over guessing at the window length.
  const epoch = log.match(/reset[^\n]*?(\d{10,13})/i);
  if (epoch) {
    const ms = Number(epoch[1]);
    return new Date(ms < 1e12 ? ms * 1000 : ms);
  }
  const iso = log.match(/reset[^\n]*?(\d{4}-\d{2}-\d{2}T[\d:]+(?:\.\d+)?Z?)/i);
  if (iso) return new Date(iso[1]);

  return new Date(new Date(last.updated_at).getTime() + windowHours * 3600_000);
}

/** Gate every dispatch: true means "quota is gone, do nothing this tick". */
function quotaBlocked() {
  const until = rateLimitedUntil();
  if (!until || Number.isNaN(until.getTime())) return false;
  if (until <= new Date()) {
    console.log(`Quota window closed at ${until.toISOString()}, now past. Proceeding.`);
    return false;
  }
  const mins = Math.round((until - Date.now()) / 60000);
  console.log(
    `Claude quota exhausted; expected back at ${until.toISOString()} (~${mins}m). ` +
      `Not dispatching — the next hourly tick will re-check.`,
  );
  return true;
}

const db = JSON.parse(fs.readFileSync('stories.json', 'utf8'));
const active = db.stories.filter((s) => ['in_progress', 'in_review', 'fixing'].includes(s.status));

if (!active.length) {
  // Nothing in flight. Hand off to the normal decision — this also covers the
  // case where a dispatch itself was lost and no story ever started.
  if (quotaBlocked()) process.exit(0);
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

if (quotaBlocked()) process.exit(0);

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
