#!/usr/bin/env node
/**
 * Mark the merged PR's story done, close its findings issue, append the audit line.
 * State change and log line land in the SAME commit so the two cannot drift.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const storyId = (process.env.PR_BODY ?? '').match(/Story:\s*(US-[A-Z0-9]+)/)?.[1];
if (!storyId) {
  console.error('No "Story: US-XXX" line in the PR body — not a pipeline PR, nothing to do.');
  process.exit(0);
}

const db = JSON.parse(fs.readFileSync('stories.json', 'utf8'));
const story = db.stories.find((s) => s.id === storyId);
if (!story) throw new Error(`${storyId} not found in stories.json`);

// Trust the event over the record: story.prNumber is whatever the last writer
// put there, and if a PR was superseded the two disagree — which would close
// the wrong issue and log a merge that did not happen.
const mergedPr = process.env.PR_NUMBER || story.prNumber;
if (story.prNumber && String(story.prNumber) !== String(mergedPr)) {
  console.log(`::warning::stories.json records PR #${story.prNumber} but #${mergedPr} merged. Using the merged one.`);
}

// Nothing between "PR opened" and "PR merged" writes to main any more: a commit landing
// there while the PR is open puts its branch behind, and under a strict up-to-date rule
// that forces a branch update, which fires `synchronize`, which re-runs pr-review, which
// commits again. In Alvus-AI, US-004 burned three review rounds and three fix runs in
// half an hour riding that loop. So the review's own bookkeeping is reconstructed here
// instead, at merge time, which is the first moment writing to main is free again.
//
// The findings issue is where that state actually lived: pr-review opens it with a
// literal `PR: #<n>` line and re-headings it `(round N)` on each pass.
let issues = [];
try {
  issues = JSON.parse(
    sh('gh', ['issue', 'list', '--state', 'all', '--limit', '100', '--json', 'number,title,body,state']),
  ).filter(
    (i) =>
      new RegExp(`^PR:\\s*#${mergedPr}\\s*$`, 'm').test(i.body ?? '') ||
      (story.issueNumber && i.number === Number(story.issueNumber)),
  );
} catch (e) {
  console.error(`Could not list issues: ${e.message}`);
}

// The body heading is authoritative, not the title: pr-review rewrites the body in place
// each round but leaves the title at whatever round opened the issue. Alvus-AI's US-004
// issue read "(round 1)" in its title while its body was already on round 2.
const roundOf = (i) => {
  const m =
    (i.body ?? '').match(/^#[^\n]*\(round\s+(\d+)\)/im) ?? (i.title ?? '').match(/\(round\s+(\d+)\)/i);
  return m ? Number(m[1]) : 0;
};

const rounds = Math.max(story.reviewRounds ?? 0, 0, ...issues.map(roundOf));
const findingsIssue = issues.length ? issues[0].number : (story.issueNumber ?? null);

story.status = 'done';
story.prNumber = Number(mergedPr);
story.issueNumber = findingsIssue;
story.reviewRounds = rounds;
fs.writeFileSync('stories.json', JSON.stringify(db, null, 2) + '\n');

const line = `${new Date().toISOString()} | ${storyId} | done | PR #${mergedPr} merged after ${rounds} review round(s)\n`;
fs.appendFileSync('docs/pipeline-log.md', line);

for (const i of issues) {
  if (i.state !== 'OPEN') continue;
  try {
    sh('gh', ['issue', 'close', String(i.number), '--comment', `Resolved: PR #${mergedPr} merged.`]);
    console.log(`Closed findings issue #${i.number}.`);
  } catch (e) {
    console.error(`Could not close issue #${i.number}:`, e.message);
  }
}

sh('git', ['config', 'user.name', 'pipeline-bot']);
sh('git', ['config', 'user.email', 'pipeline-bot@users.noreply.github.com']);
sh('git', ['add', 'stories.json', 'docs/pipeline-log.md']);
sh('git', ['commit', '-m', `chore(pipeline): ${storyId} done`]);

// Concurrency serializes the workflows, but a human pushing to main during the
// run still loses us the race. An unretried push here strands the story as
// in_review forever with nothing to re-dispatch it, so retry with a rebase.
for (let attempt = 1; ; attempt++) {
  try {
    sh('git', ['push']);
    break;
  } catch (e) {
    if (attempt === 5) throw new Error(`push failed after ${attempt} attempts: ${e.message}`);
    console.error(`push rejected (attempt ${attempt}), rebasing and retrying`);
    sh('git', ['pull', '--rebase', '--autostash']);
  }
}

const remaining = db.stories.filter((s) => s.status !== 'done').length;
console.log(`${storyId} done. ${remaining} remaining.`);
