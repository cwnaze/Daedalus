#!/usr/bin/env node
/**
 * Mark the merged PR's story done, close its findings issue, append the audit line.
 * State change and log line land in the SAME commit so the two cannot drift.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const storyId = (process.env.PR_BODY ?? '').match(/Story:\s*(US-[A-Z]\d+)/)?.[1];
if (!storyId) {
  console.error('No "Story: US-XXX" line in the PR body — not a pipeline PR, nothing to do.');
  process.exit(0);
}

const db = JSON.parse(fs.readFileSync('stories.json', 'utf8'));
const story = db.stories.find((s) => s.id === storyId);
if (!story) throw new Error(`${storyId} not found in stories.json`);

story.status = 'done';
fs.writeFileSync('stories.json', JSON.stringify(db, null, 2) + '\n');

const line = `${new Date().toISOString()} | ${storyId} | done | PR #${story.prNumber} merged after ${story.reviewRounds} review round(s)\n`;
fs.appendFileSync('docs/pipeline-log.md', line);

if (story.issueNumber) {
  try {
    sh('gh', ['issue', 'close', String(story.issueNumber), '--comment', `Resolved: PR #${story.prNumber} merged.`]);
  } catch (e) {
    console.error(`Could not close issue #${story.issueNumber}:`, e.message);
  }
}

sh('git', ['config', 'user.name', 'pipeline-bot']);
sh('git', ['config', 'user.email', 'pipeline-bot@users.noreply.github.com']);
sh('git', ['add', 'stories.json', 'docs/pipeline-log.md']);
sh('git', ['commit', '-m', `chore(pipeline): ${storyId} done`]);
sh('git', ['push']);

const remaining = db.stories.filter((s) => s.status !== 'done').length;
console.log(`${storyId} done. ${remaining} remaining.`);
