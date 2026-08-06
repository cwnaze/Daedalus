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

// One listing serves both checks below. No `status=` filter: that parameter takes a
// single value, and `status=in_progress` silently omits `queued`, `waiting`, and
// `requested` — a dispatch sitting in the queue would read as "nothing running" and
// earn itself a second, duplicate dispatch.
const allRuns = JSON.parse(
  sh('gh', ['api', `repos/${repo}/actions/runs?per_page=100`]),
).workflow_runs.filter((r) => r.name !== 'pipeline-watchdog');

// A pipeline workflow still running means the story is progressing, not stalled.
const pending = allRuns.filter((r) => r.status !== 'completed');

if (pending.length) {
  console.log(
    `Active runs: ${pending.map((r) => `${r.name}(${r.status})`).join(', ')}. Not stalled.`,
  );
  process.exit(0);
}

// Last mutation of the state file is the pipeline's heartbeat: every transition
// commits it, so its age is the age of the last thing that actually happened.
const lastTouch = new Date(sh('git', ['log', '-1', '--format=%cI', '--', 'stories.json']));
const idleMinutes = Math.round((Date.now() - lastTouch.getTime()) / 60000);

// Elapsed time is a guess about whether anything is still coming. A completed run that
// did not succeed is not a guess: these workflows only ever produce their successor's
// event on the success path, so once one dies the chain is provably over. Waiting out
// STALL_MINUTES from there is dead time — and worse, the clock is anchored to the last
// *transition*, so a run that fails moments after committing one buys itself a nearly
// full window plus up to an hour of cron slack.
//
// Only the workflows that emit pipeline events count. `ci` failing is a red build, which
// pr-review is supposed to see and act on; that is the pipeline working, not stalling.
const emitters = ['story-start', 'pr-review', 'pr-fix', 'story-complete', 'production-prep'];
// `skipped`/`neutral`/`action_required` are not deaths: an `if:` that evaluated false or
// a job awaiting approval. Only conclusions that mean "this run will never emit".
const dead = ['failure', 'timed_out', 'startup_failure', 'cancelled'];
const failedSinceTouch = allRuns.filter(
  (r) =>
    emitters.includes(r.name) &&
    dead.includes(r.conclusion) &&
    new Date(r.updated_at) > lastTouch,
);

// Consecutive because lastTouch only advances on a real transition: a resumed run that
// dies again writes no state, so its failure joins the same batch. Any genuine progress
// moves lastTouch and empties this list, which is the reset.
const MAX_RETRIES = 3;
const exhausted = failedSinceTouch.length >= MAX_RETRIES;

const stalled = failedSinceTouch.length > 0 || idleMinutes >= stallMinutes;

if (!stalled) {
  console.log(`Last transition ${idleMinutes}m ago (threshold ${stallMinutes}m). Not stalled.`);
  process.exit(0);
}

const story = active[0];
const cause = failedSinceTouch.length
  ? `${failedSinceTouch.length} failed run(s) since the last transition ` +
    `(${failedSinceTouch.map((r) => `${r.name}#${r.run_number} ${r.conclusion}`).join(', ')})`
  : `idle ${idleMinutes}m, no runs active`;
console.log(`STALLED: ${story.id} is ${story.status}, ${cause}.`);

if (dryRun) {
  console.log('[dry run] stopping here.');
  process.exit(0);
}

if (quotaBlocked()) process.exit(0);

if (story.status === 'in_progress' && !exhausted) {
  // implement-story has crash-resume logic for exactly this: it finds the
  // non-terminal story, reconciles it against any open PR, and continues.
  // Nothing invoked that logic until this workflow existed.
  sh('gh', ['api', `repos/${repo}/dispatches`, '-f', 'event_type=story-start']);
  console.log(`Re-dispatched story-start to resume ${story.id} (attempt ${failedSinceTouch.length + 1}).`);
  process.exit(0);
}

// Either the retry budget is gone, or this is in_review/fixing — where a PR exists and
// re-running review is not ours to guess at, since pushing a commit or reopening the PR
// would fabricate history. Escalate rather than act.
const note = exhausted
  ? `Pipeline watchdog: **${story.id}** is \`${story.status}\` and has burned all ` +
    `${MAX_RETRIES} retries without making a transition.\n\nFailed runs:\n` +
    failedSinceTouch.map((r) => `- ${r.name} #${r.run_number} — ${r.conclusion} — ${r.html_url}`).join('\n') +
    `\n\nNot re-dispatching: three identical failures are a bug to fix, not a run to retry.`
  : `Pipeline watchdog: **${story.id}** has been \`${story.status}\` for ${idleMinutes} minutes ` +
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
