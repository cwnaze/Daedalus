---
name: implement-story
description: Select the next eligible story from stories.json, implement it on a feature branch with its demo spec, and open a pull request. Invoked by the story-start workflow on dispatch, or manually when the user asks to start the next story.
---

# Implement Story

## 1. Select

Read `stories.json` (spine repo; via `gh api` if this repo is not the spine).

Assert no story is `in_progress`, `in_review`, or `fixing`. If one is, this is a crash
resume — take that story rather than a new one, and reconcile: if it has an open PR,
stop and let `pr-review` handle it; if not, reset it to `pending` and continue.

Eligible = `status: pending` and every `dependsOn` is `done`. Take the first in array order.

If none eligible and none pending: dispatch `production-prep` and exit. That is the
pipeline's natural terminus.

Read the open `steering` issue. Treat unresolved comments as binding constraints.

## 2. Branch and set state

```
feature/<id-lowercase>-<slug-of-title>
```

Set `status: in_progress`, `branch`, commit `stories.json` to main with a log line
appended to `docs/pipeline-log.md` in the same commit.

## 3. Implement

Read `CLAUDE.md` and only the `docs/` files relevant to this story — not all of them.

Build against the acceptance criteria plus the definition of done. Follow existing
conventions in the codebase over your own preferences; where the codebase is silent,
follow `CLAUDE.md`; where both are silent, pick and record it in `notes`.

## 4. Write the demo spec

For `demoKind: "browser"`, write the Playwright spec at `verification.specs[0]`. It
walks the **real user flow**, not just assertions — the sequence a person would perform.
Use `demoStep()` from `e2e/demo.ts` at each meaningful moment; that is what captures
screenshots and narration and generates `docs/demos/<ID>.md`.

Determinism rules, non-negotiable because flake here poisons every later review:
- Pinned viewport (set in `playwright.config.ts`)
- Animations disabled
- Seeded fixture data, never live or random
- Wait on state, never on time

For `demoKind: "command"`, capture the proving command's output into the demo doc instead.

## 5. Verify locally before opening the PR

Run `verification.commands`, then your spec, then every spec belonging to a `done`
story. If anything fails, fix it now. Opening a PR you already know is red wastes a
full review round against the 3-round budget.

## 6. Open the PR

Title: `<ID>: <title>`. Body must contain:

```
Story: <ID>
Demo: docs/demos/<ID>.md

## What changed
## Acceptance criteria
- [x] each criterion, checked
## Deviations
```

Then enable auto-merge:

```bash
gh pr merge <number> --auto --squash
```

This is what closes the loop. Branch protection *permits* a merge, it never performs
one — without auto-merge armed here, `pr-review` approves the PR and the pipeline stops
forever with nothing to merge it and no signal that it is waiting. With it armed, the
approval satisfies the last required check and GitHub merges, which fires
`story-complete`, which dispatches the next story.

Auto-merge requires it to be enabled on the repo and at least one required status check
or review on `main`; `repo-bootstrap` verifies both. If the command fails, do not fall
back to merging directly — report it, because an agent that merges on its own judgement
has no check on it.

Set `prNumber`, `status: in_review`, commit to main with a log line.
