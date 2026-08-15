# Pipeline backlog

Open defects in the generated pipeline templates under `pipeline/`. Each one reproduces
in every project Daedalus generates, so they are fixed here, not in the generated repo.

Source: the Alvus AI POC, 2026-08-14 — investigating a stall where US-023 sat
`needs_human` and US-025's `pr-review` failed to produce a verdict.

> Alvus was confirmed to be *behind* these templates, not ahead: the two trees differ
> almost entirely by comment de-branding, and `.github/scripts/dispatch-next.mjs` is
> byte-identical. Earlier fix rounds were already backported. Don't assume the generated
> repo is the newer copy — diff before porting anything in either direction.

---

## 1. `pr-review` can end with neither a verdict file nor a findings issue

**File:** `pipeline/.github/workflows/pr-review.yml`, `pipeline/.claude/skills/pr-review/SKILL.md`

The recovery block handles the case where the agent filed the findings issue (skill step
6) but exited before writing `.pipeline/review-verdict.json` (step 7) — that's the PR #28
case it was written for. It does not handle the agent producing *neither*.

Observed on Alvus PR #55: run finished `"subtype": "success"`, `"is_error": false`, 78 of
100 turns, $3.98 spent, 4 permission denials — and wrote no verdict and filed no issue.
The fallback found nothing to recover from, took the "truly inconclusive" branch, labelled
the PR `needs-human`, and the entire review was discarded. The pipeline then sat idle for
~9 hours while the watchdog commented 5 times.

**Fix direction:** have the skill write the verdict file *before* filing the issue. That
inverts which artifact survives a truncated run — the verdict is small, cheap, and is the
thing the workflow actually needs; the issue is reconstructible from it, not vice versa.

**Recurred on Alvus PR #61 (US-024), 2026-08-15**, in the re-review-after-fix shape: round
1 wrote its verdict normally; the round-2 run that reviewed the pushed fix ended
`"subtype": "success"`, `"is_error": false`, 66 of 100 turns, $2.48, 2 permission denials —
and left *no* verdict, *no* PR comment, and no edit to the existing findings issue. 10.5
minutes of review work with nothing recorded.

Two things worth carrying into the fix:

- This is not a usage limit, and the fallback's PR comment at `pr-review.yml:87` should
  stop suggesting it is. Every observation so far (PR #28, #55, #61) is a clean `success`
  result well under the turn cap. Steering a human toward "wait for the limit to reset" for
  a failure mode that has never once been a limit costs a debugging cycle every time.
- The agent transcript is unrecoverable — `claude-execution-output.json` is written to the
  runner temp dir and never uploaded — so *why* step 7 gets skipped can't be diagnosed
  after the fact. Upload it as an artifact from `pr-review.yml`; three occurrences have
  now each been dead ends for the same reason.

The skill already devotes a call-out to this exact failure (`SKILL.md` step 7, "Do not let
this be step 8 you meant to get to"). Prose escalation has now failed twice, which is the
argument for the ordering change above over yet another warning.

## 1a. ~~The recovery block's blocking-finding count includes fixed findings~~ — FIXED 2026-08-15

**File:** `pipeline/.github/workflows/pr-review.yml`

```bash
blocking=$(... | grep -c '^- \[' || true)
```

`^- \[` matches `- [x]` as well as `- [ ]`. On a re-review after `pr-fix`, every finding in
the issue is checked off, so a fully-fixed PR still scores non-zero and the fallback
requests changes on work that is done.

This is what actually stalled Alvus PR #61: the round-1 finding was fixed and checked, the
round-2 fallback logged `Recovered from issue #62: round=1 blocking_findings=1`, and the PR
took a `CHANGES_REQUESTED` that nothing would ever clear.

**Fixed:** now matches `'^- \[ \]'`. Note the interaction with item 1b — with a correct
count this run would have taken the approve path, which needs no trigger and would have
merged cleanly. The counting bug is what routed it onto the broken path.

## 1b. ~~The recovery block's `agent-fix` re-label triggers nothing~~ — FIXED 2026-08-15

**File:** `pipeline/.github/workflows/pr-review.yml`

The agent step deliberately uses `PIPELINE_PAT`, with a comment explaining why: *"an issue
created by GITHUB_TOKEN triggers nothing."* The verdict step immediately below then uses
`GH_TOKEN: ${{ secrets.REVIEWER_TOKEN || secrets.GITHUB_TOKEN }}` — and its
changes-requested branch does `gh issue edit --add-label agent-fix`, whose entire purpose is
to fire `pr-fix`.

When `REVIEWER_TOKEN` is unset (it is, on Alvus) that edit lands as `github-actions[bot]`
and fires no `issues` event. Confirmed on issue #62: the 15:19 and 15:33 events are actored
by the PAT, the 15:47 fallback edit by the bot, and no `pr-fix` run follows it.

The `REVIEWER_TOKEN || GITHUB_TOKEN` choice is correct for its stated reason — that step
also calls `gh pr review`, and `PIPELINE_PAT` opened the PR, so GitHub rejects
self-approval. The bug is using one identity for two jobs with opposite constraints.

**Fixed:** split them — `REVIEWER_TOKEN || GITHUB_TOKEN` still covers the `gh pr review`
calls, and a new `ISSUE_TOKEN` (`PIPELINE_PAT`) covers the `gh issue edit` that has to
trigger a workflow.

Both 1a and 1b are fixed in `pipeline/.github/workflows/pr-review.yml` here and in the
Alvus copy (on `feature/us-024-stripe-webhook-sync`, which needed the fix live to
re-review itself out of the deadlock). Item 1 proper — the agent skipping step 7 at all —
is still open; these two only stop that miss from deadlocking a PR. Also reworded the
"truly inconclusive" PR comment to stop blaming the usage limit, per the note in item 1.

## 2. No guard against two branches claiming the same migration number

**File:** `pipeline/.claude/skills/implement-story/SKILL.md`

Two stories branched from the same `main` both numbered their migration `0008`
(`0008_past_the_anarchist.sql` and `0008_nappy_gressill.sql`) and both rewrote
`drizzle/migrations/meta/_journal.json`. Whichever merges second conflicts, and a careless
conflict resolution produces a broken migration chain — the second branch's snapshot was
computed against a schema lacking the first branch's tables.

Note this is a *loud* conflict in `_journal.json` but a *silent* wrongness in the
resulting schema, which is what makes it worth a guard.

**Fix direction:** before creating a migration, check the remote for other `feature/*`
branches that already claim that number.

## 3. `.gitignore` misses graphify build artifacts

**File:** `pipeline/.gitignore`

`graphify-out/cache/ast/**` and `graphify-out/graph.json` are not ignored, so story PRs
carry ~70 files of pure artifact churn that conflicts with every other branch that ran
`graphify update`.

## 4. `.gitignore` entries that exist only in generated repos

**File:** `pipeline/.gitignore`

Alvus had three entries this template lacks. Port them up:

```
.wrangler/
graphify-out/cache/last_query_stamp
# dated backup snapshots graphify writes before a relabel; local safety net only
graphify-out/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]/
```

## 5. Recurring crash-resume in `story-start`

**File:** `pipeline/.github/workflows/story-start.yml`, `pipeline/.claude/skills/implement-story/SKILL.md`

`story-start` writes the `in_progress` marker to `main`, then dies before creating the
branch or PR on the remote. The next run finds no branch, resets the story to `pending`,
and re-selects it.

Seen 7 times across one project: US-013 ×2, US-019 ×2, US-021, US-023 ×2. It self-heals,
so no story is ever lost — but each occurrence burns a full run and hours of wall-clock.
Root cause never identified; the marker commit landing before the branch creation suggests
the failure is in the window between those two steps.

---

## Ruled out — do not "fix" this

**The story selector is not broken.** It was suspected of permanently skipping stories
that only become eligible after a blocked story clears (US-024 sat `pending` behind a
`needs_human` US-023 while later stories proceeded).

Simulating `dispatch-next.mjs` against real data disproves it. There is no cursor —
`eligible[0]` is recomputed from the full story list on every dispatch, so a deferred
story is picked up as soon as its dependency lands, and wins on array order over anything
later:

```
A. US-025 merges first, US-023 still stuck:  DISPATCH -> US-026
   then US-023 gets fixed + merged:          DISPATCH -> US-024   <- not skipped
   then US-024 merges:                       DISPATCH -> US-026
```

A second backstop refuses the `production-prep` handoff while any story is still
`pending`, so nothing falls off the end of the board either.

Changing the eligibility rule would trade real capability — unrelated work proceeding
during a human-blocked story — for protection against a problem that does not exist.

**What actually went wrong** is item 2 above, and its cause was upstream of selection:
`needs_human` left implemented code stranded on a branch that was never opened as a PR,
while the pipeline kept building on a `main` that lacked it. Any story started in that
window would have collided identically, whichever one the selector picked. The lesson is
about not stranding un-PR'd work, not about selection order.
