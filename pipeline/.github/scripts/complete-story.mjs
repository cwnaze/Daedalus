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

story.status = 'done';
fs.writeFileSync('stories.json', JSON.stringify(db, null, 2) + '\n');

// Trust the event over the record: story.prNumber is whatever the last writer
// put there, and if a PR was superseded the two disagree — which would close
// the wrong issue and log a merge that did not happen.
const mergedPr = process.env.PR_NUMBER || story.prNumber;
if (story.prNumber && String(story.prNumber) !== String(mergedPr)) {
  console.log(`::warning::stories.json records PR #${story.prNumber} but #${mergedPr} merged. Using the merged one.`);
}

const line = `${new Date().toISOString()} | ${storyId} | done | PR #${mergedPr} merged after ${story.reviewRounds} review round(s)\n`;
fs.appendFileSync('docs/pipeline-log.md', line);

// story.issueNumber is written by pr-review, which is an agent following a skill — so
// treat it as a hint, not a guarantee. When it is missing, fall back to the issue body,
// which pr-review is templated to open with a literal `PR: #<n>` line. Without this
// fallback a single skipped bookkeeping step leaks an open findings issue per story,
// silently, with the merge otherwise looking clean.
const toClose = new Set();
if (story.issueNumber) toClose.add(Number(story.issueNumber));
try {
  const open = JSON.parse(
    sh('gh', ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,body']),
  );
  for (const i of open) {
    if (new RegExp(`^PR:\\s*#${mergedPr}\\s*$`, 'm').test(i.body ?? '')) toClose.add(i.number);
  }
} catch (e) {
  console.error(`Could not list open issues: ${e.message}`);
}

for (const n of toClose) {
  try {
    sh('gh', ['issue', 'close', String(n), '--comment', `Resolved: PR #${mergedPr} merged.`]);
    console.log(`Closed findings issue #${n}.`);
  } catch (e) {
    console.error(`Could not close issue #${n}:`, e.message);
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
