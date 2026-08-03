#!/usr/bin/env node
/**
 * Decide what the pipeline should do next, and dispatch it.
 *
 * Every path that advances the pipeline goes through here rather than through
 * an inline `gh api dispatches` call, so the pause switch and the stuck-state
 * checks cannot be bypassed by one caller forgetting them.
 *
 * Exits 0 in every non-error case — "nothing to dispatch" is a normal outcome,
 * not a failed run.
 *
 * Env:
 *   GH_TOKEN     PIPELINE_PAT. A workflow's own GITHUB_TOKEN cannot trigger
 *                another workflow, so dispatching with it dies silently.
 *   REPO         owner/name
 *   DRY_RUN      "true" to print the decision without dispatching
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const repo = process.env.REPO;
if (!repo) throw new Error('REPO is required');
const dryRun = process.env.DRY_RUN === 'true';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const dispatch = (event) => {
  if (dryRun) {
    console.log(`[dry run] would dispatch: ${event}`);
    return;
  }
  try {
    sh('gh', ['api', `repos/${repo}/dispatches`, '-f', `event_type=${event}`]);
  } catch (e) {
    // Unlike the guard lookups above, this one must fail loudly: a dispatch that
    // does not land is exactly the "chain dies silently" failure the whole
    // PIPELINE_PAT requirement exists to prevent. A 404 here usually means the
    // token lacks `repo` scope rather than that the repo is missing.
    console.error(
      `::error::Failed to dispatch ${event} to ${repo}. The pipeline has stopped here. ` +
        `Check that PIPELINE_PAT is set and has repo scope.\n${(e.stderr || e.message).toString().trim()}`,
    );
    process.exit(1);
  }
  console.log(`Dispatched: ${event}`);
};

/**
 * The steering issue is the project owner's control channel — the whole point
 * is that it works from a phone with no UI. The most recent pause/resume
 * directive wins, so an owner can stop and restart the pipeline by commenting.
 */
function isPaused() {
  let issues;
  try {
    issues = JSON.parse(
      sh('gh', ['issue', 'list', '--repo', repo, '--label', 'steering', '--state', 'open', '--json', 'number', '--limit', '1']),
    );
  } catch (e) {
    // No steering issue, or the label does not exist yet. Not a reason to halt.
    console.error(`Could not read the steering issue (${e.message}) — treating as not paused.`);
    return false;
  }
  if (!issues.length) return false;

  const { body, comments } = JSON.parse(
    sh('gh', ['issue', 'view', String(issues[0].number), '--repo', repo, '--json', 'body,comments']),
  );

  // Only people with write access steer the pipeline. On a public repo, an
  // unfiltered read means any stranger can halt the build by commenting "pause"
  // — and the same channel is read by agents holding a PAT with repo scope.
  const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
  const trusted = comments.filter((c) => TRUSTED.includes(c.authorAssociation));
  const ignored = comments.length - trusted.length;
  if (ignored) console.log(`Ignoring ${ignored} steering comment(s) from non-collaborators.`);

  let paused = false;
  for (const text of [body, ...trusted.map((c) => c.body)]) {
    // Only a line that is exactly the directive counts. Prose *about* pausing
    // ("we should pause if X") must not stop the pipeline.
    for (const line of (text ?? '').split('\n')) {
      const w = line.trim().toLowerCase().replace(/[.!]$/, '');
      if (w === 'pause') paused = true;
      else if (w === 'resume' || w === 'unpause') paused = false;
    }
  }
  return paused;
}

/**
 * Circuit breaker. `--max-turns` bounds one run; nothing bounded the aggregate,
 * and every failure mode that loops (a review/fix cycle that never converges, a
 * watchdog re-dispatching something permanently broken) bills the whole way down
 * with no ceiling and no alert. A day's worth of healthy pipeline is well under
 * the default.
 */
function overBudget() {
  const max = Number(process.env.MAX_RUNS_PER_DAY ?? 50);
  if (max <= 0) return false;
  const since = new Date(Date.now() - 86400e3).toISOString();
  let count;
  try {
    count = JSON.parse(sh('gh', ['api', `repos/${repo}/actions/runs?created=>${since}&per_page=100`])).total_count;
  } catch (e) {
    // Never let a failed budget lookup halt a healthy pipeline.
    console.error(`Could not count recent runs (${e.message}) — proceeding.`);
    return false;
  }
  if (count < max) {
    console.log(`Budget: ${count}/${max} workflow runs in the last 24h.`);
    return false;
  }
  console.log(
    `::error::Budget stop: ${count} workflow runs in the last 24h (limit ${max}). ` +
      `Not dispatching. Raise MAX_RUNS_PER_DAY if this is expected, or investigate a loop.`,
  );
  return true;
}

const db = JSON.parse(fs.readFileSync('stories.json', 'utf8'));
const by = (...s) => db.stories.filter((x) => s.includes(x.status));

const active = by('in_progress', 'in_review', 'fixing');
const stuck = by('needs_human', 'blocked');
const done = new Set(by('done').map((s) => s.id));
const eligible = by('pending').filter((s) => (s.dependsOn ?? []).every((d) => done.has(d)));

if (active.length) {
  // The watchdog calls this too; it must not stack a second story on top of a
  // run that is still going.
  console.log(`Already active: ${active.map((s) => `${s.id} (${s.status})`).join(', ')}. Nothing to dispatch.`);
  process.exit(0);
}

if (isPaused()) {
  console.log('Pipeline is paused via the steering issue. Comment "resume" to continue.');
  process.exit(0);
}

if (overBudget()) process.exit(0);

if (eligible.length) {
  console.log(`Next eligible: ${eligible[0].id}`);
  dispatch('story-start');
  process.exit(0);
}

const pendingBlocked = by('pending').length;
if (stuck.length || pendingBlocked) {
  // production-prep refuses to run against an incomplete build, so dispatching
  // it here would just burn a runner to print the same message.
  console.log(
    `No eligible story. Stuck: ${stuck.map((s) => `${s.id} (${s.status})`).join(', ') || 'none'}. ` +
      `Pending but dependency-blocked: ${pendingBlocked}. Needs a human — not dispatching.`,
  );
  process.exit(0);
}

// production-prep is a hard stop awaiting a human: it opens a report PR and
// dispatches nothing further. Re-running it while that PR is open re-does the
// whole fan-out, re-appends its findings, and re-opens the report — an expensive
// loop whose only brake would be the daily ceiling above.
let openPrep = [];
try {
  openPrep = JSON.parse(
    sh('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--head', 'chore/production-prep', '--json', 'number']),
  );
} catch (e) {
  console.error(`Could not check for an open production-prep PR (${e.message}) — proceeding.`);
}
if (openPrep.length) {
  console.log(`production-prep PR #${openPrep[0].number} is still open. It needs a human, not another run.`);
  process.exit(0);
}

// Deliberately NOT dispatched. At --max-turns 200 over a whole-repo fan-out it is by
// far the largest single spend in the pipeline, and it runs on a subscription quota
// shared with interactive work. Everything up to here is safe to leave unattended;
// this one step is worth choosing to start. Run it with:
//
//   gh workflow run production-prep --repo <owner>/<repo>
//
// The workflow still accepts repository_dispatch, so restoring the automatic
// behaviour is a one-line change here if the quota ever stops being the constraint.
console.log('All stories done. production-prep is manual — not dispatching.');

const title = 'All stories done — run production-prep';
// The watchdog calls this script hourly, so an unguarded `issue create` would file a
// duplicate every tick. Reuse the open one instead.
let existing = [];
try {
  existing = JSON.parse(
    sh('gh', ['issue', 'list', '--repo', repo, '--state', 'open', '--label', 'needs-human', '--search', title, '--json', 'number,title']),
  ).filter((i) => i.title === title);
} catch (e) {
  console.error(`Could not check for an existing handoff issue (${e.message}).`);
}
if (existing.length) {
  console.log(`Handoff issue #${existing[0].number} is already open.`);
  process.exit(0);
}

try {
  sh('gh', ['issue', 'create', '--repo', repo, '--title', title, '--label', 'needs-human', '--body',
    'Every story on the board is `done`, so the pipeline has reached its terminus.\n\n' +
    '`production-prep` is the last step and is **not dispatched automatically** — it is the ' +
    'largest single quota spend in the pipeline, so it is left for you to start deliberately:\n\n' +
    '```bash\n' +
    `gh workflow run production-prep --repo ${repo}\n` +
    '```\n\n' +
    'It opens a readiness report PR on `chore/production-prep` and turns must-fix findings ' +
    'into new stories. Nothing else will run until you do.',
  ]);
  console.log('Opened the production-prep handoff issue.');
} catch (e) {
  console.error(`Could not open the handoff issue: ${e.message}`);
  process.exit(1);
}
