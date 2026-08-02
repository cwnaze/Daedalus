---
name: pr-review
description: Review a story pull request — diff quality, functional verification, demo regeneration, regression suite, and UI rendering — and record every finding in a single linked GitHub issue. Invoked by the pr-review workflow on pull_request opened/synchronize.
---

# PR Review

One agent, one pass. **Not a fan-out.** Deliberately: a fan-out on a single-story diff
costs many times more and produces overlapping findings that the fix agent then has to
reconcile.

## Order of operations

Run in this order and stop early where noted — a build failure makes the rest noise.

### 1. Context

PR diff, the story record from `stories.json` (via `Story: <ID>` in the PR body),
`CLAUDE.md`, and open `steering` comments.

### 2. Static verification

Run `verification.commands`. If any fail, skip to step 6 and report only those — do not
review a diff that does not build.

### 3. Functional verification

Bring services up (`docker compose up -d`, wait on health checks). Then:

- Run this story's specs. They must pass **and** regenerate `docs/demos/<ID>.md`.
- Run every spec belonging to a `done` story. **This is the regression check** — the
  reason specs are mandatory rather than optional.

### 4. Demo judgement

Read the regenerated demo doc and its screenshots. Two distinct questions:

- **Does it render correctly?** Layout, overflow, contrast, alignment, visible error
  states, obviously broken styling.
- **Does it actually demonstrate the story?** A spec can pass while demoing something
  trivial that satisfies the letter of the criteria. This is a judgement call and it is
  the main thing a human reviewer would catch that a green suite would not.

Also diff this run's screenshots against the previous run's for `done` stories. Changed
pixels on an untouched story are a visual regression even when the spec is green.

### 5. Diff review

Correctness against the acceptance criteria. Then, specifically:

- Server-side authz on every mutating endpoint the diff adds
- Input validation at every new boundary
- Secrets, keys, tokens in source or logs
- Error paths — what the user sees when this fails
- Convention drift from the existing codebase
- Dead code, stray debug output, commented-out blocks

Report **all** findings, not just blockers. Severity-tag them; do not filter them.

### 6. Record findings

**One issue per PR, updated in place.** If `issueNumber` is null, create it; otherwise
`gh issue edit` and rewrite the body, **preserving checked boxes** so the fix agent can
see what is already handled.

```markdown
# Review findings — <ID> (round N)
PR: #<prNumber>

## Blocking
- [ ] **[correctness]** <finding> — `path:line`
      Expected: ... Actual: ...

## Non-blocking
- [ ] **[convention]** ...
```

Label `agent-fix`. Increment `reviewRounds`.

### 7. Terminate or approve

- **Clean:** approve the PR. Do not merge it yourself — `implement-story` armed
  `gh pr merge --auto` when it opened the PR, so your approval satisfies the last
  required check and GitHub performs the merge. An agent that merges directly, outside
  branch protection, has no check on it. If the PR does not merge within a few minutes,
  auto-merge was never armed or the repo has it disabled — say so rather than merging
  by hand.
- **Findings, `reviewRounds < 3`:** the issue update fires `pr-fix`.
- **`reviewRounds >= 3`:** remove `agent-fix`, add `needs-human`, comment with what is
  still failing and what each round tried, set `status: needs_human`. **Do not dispatch
  anything.** This is the loop's only non-success exit and it must be a hard stop.
