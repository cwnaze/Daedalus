---
name: repo-bootstrap
description: Clone the project repos, commit the pipeline scaffold (CLAUDE.md, stories.json, workflows, skills, docs) directly to main, verify the automation chain actually fires, and dispatch the first story. Use as the final Phase 1 step, or whenever the user says the repos are created and ready, provides SSH URLs, or types /repo-bootstrap.
---

# Repo Bootstrap

Phase 1, step 5 of 5. The handoff from your machine to GitHub Actions. After this
skill, nothing local is required.

## Procedure

### 1. Collect SSH URLs

Ask the user for the SSH URL of each repo. Check `stories.json` for whether the project
is split — if `repos` has more than one key, ask for both and confirm which is the spine
(the one carrying `stories.json`; default to the backend).

Do not proceed on a guessed URL.

### 2. Clone and assemble

Clone into `/tmp/<slug>/repos/`. Commit to `main` directly:

```
CLAUDE.md                     # conventions + definition of done + version warnings
.env.example                  # from project-docs; the env contract for local + CI
stories.json                  # spine repo only
.mcp.json                     # from stack-and-mcp-selection
docs/                         # trimmed working copies from project-docs
docs/pipeline-log.md          # append-only audit log, seeded with the bootstrap entry
docs/demos/                   # empty, with a README explaining these are generated
.claude/skills/               # implement-story, pr-review, pr-fix, production-prep
.github/workflows/            # story-start, pr-review, pr-fix, story-complete, production-prep
e2e/                          # harness: playwright config + demo helper
scripts/sync-secrets.sh       # pushes .env values up to repo secrets
README.md
.gitignore                    # must include .env
```

Non-spine repos get everything except `stories.json`; their workflows read it from the
spine via `gh api`.

### 3. Env gate — stop and wait for the user

`.env.example` is committed but empty of values. Before any verification can pass:

1. Tell the user to `cp .env.example .env`, populate it, and say when done. List each
   variable with the note about where to obtain it, so this is a checklist and not a
   scavenger hunt.
2. **Stop here.** Do not proceed on an unpopulated `.env` — every downstream check
   depends on real values, and a bootstrap that "passes" against blanks is worse than
   one that fails.
3. When they confirm, verify `.env` has a non-empty value for every key in
   `.env.example`. Report any blanks rather than assuming they are intentional.
4. Run `./scripts/sync-secrets.sh` to push them to repo secrets, and confirm with
   `gh secret list` that the count matches.

`.env` itself is never committed. CI rebuilds it on each runner from repo secrets via
`.github/scripts/write-env.mjs`.

### 4. Verify the pipeline before trusting it

Run every check and report pass/fail. **Do not dispatch story 1 until all pass.**

- [ ] `ANTHROPIC_API_KEY` exists as a repo secret
- [ ] `PIPELINE_PAT` exists as a repo secret — a PAT or GitHub App token with `repo` and
      `workflow` scope. **This is the failure everyone hits:** a workflow's own
      `GITHUB_TOKEN` cannot trigger another workflow, so without this the chain dies
      silently after story 1 with no error anywhere.
- [ ] Every key in `.env.example` exists in `gh secret list`
- [ ] `.env` is gitignored and absent from `git ls-files`
- [ ] Branch protection on `main`: require PR, require status checks, no force push
- [ ] Labels exist: `agent-fix`, `needs-human`, `steering`
- [ ] The steering issue exists, labeled `steering`, pinned
- [ ] `gh workflow run story-start.yml` dispatches without error
- [ ] `gh workflow list` shows all five workflows registered

### 5. Dry run

Dispatch `story-start` with `dry_run: true`. It should select story 1, print the plan,
and exit without writing. If selection picks the wrong story, the `dependsOn` graph is
wrong — fix `stories.json` before a real run.

### 6. Hand off

Report to the user: repos, first story, where the steering issue is, and how to follow
along from a phone (GitHub mobile, watch the repo, subscribe to `needs-human`).

Then dispatch `story-start` for real.
