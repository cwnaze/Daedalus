---
name: repo-bootstrap
description: Clone the project repos, commit the pipeline scaffold (CLAUDE.md, stories.json, workflows, skills, docs) directly to main, verify the automation chain actually fires, and dispatch the first story. Use as the final planning step, or whenever the user says the repos are created and ready, provides SSH URLs, or types /repo-bootstrap.
---

# Repo Bootstrap

Planning, step 5 of 5. The handoff from your machine to GitHub Actions. After this
skill, nothing local is required.

## Procedure

### 1. Collect SSH URLs

Ask the user for the SSH URL of each repo. Check `stories.json` for whether the project
is split — if `repos` has more than one key, ask for both and confirm which is the spine
(the one carrying `stories.json`; default to the backend).

Do not proceed on a guessed URL.

### 2. Clone and assemble

**Existing repositories: never commit to `main`, and never overwrite.**

Committing the scaffold straight to `main` is safe on an empty repo and destructive on a
populated one — the file list below includes `README.md`, `.gitignore`, and `CLAUDE.md`,
all of which a real project already has and none of which you may clobber.

On any repo with existing history:

1. Work on a branch, `chore/pipeline-bootstrap`, and open a PR. The user reviews the
   whole scaffold before it lands, which is the same standard the pipeline holds itself
   to for every other change.
2. For each file below, if it already exists: **do not overwrite it.** Merge additively
   where the format allows (append to `.gitignore`, add a section to `README.md`), and
   where it does not, write yours alongside as `<name>.pipeline` and list every one of
   them for the user to reconcile.
3. `pipeline.json` comes from `codebase-inventory`, confirmed against a build you
   actually ran — not from the greenfield template.
4. Check for **name collisions** before copying, in both directions:
   - `.github/workflows/` — an existing `ci.yml` is the common case, and silently
     replacing a project's real CI is the worst possible failure here.
   - `.claude/skills/` — the pipeline installs `implement-story`, `pr-review`, `pr-fix`,
     and `production-prep`. A project that already has a skill by one of those names
     loses it, and the loss is quiet: the pipeline keeps working because *its* version is
     the one now present.

   On any collision, stop and ask. Do not rename either side on your own initiative — the
   workflows invoke these skills by name (`prompt: /pr-review`), so renaming ours means
   editing the workflow that calls it, and renaming theirs breaks whatever invoked it.
5. Report the full list of files added, files merged, and files left alone, before the
   PR is opened.

The verification checklist in step 4 still applies in full, and the dry run in step 5
matters more here, not less.

**Empty repositories**, and only those: clone into `/tmp/<slug>/repos/` and commit to
`main` directly:

```
CLAUDE.md                     # conventions + definition of done + version warnings
.env.example                  # from project-docs; the env contract for local + CI
stories.json                  # spine repo only
.mcp.json                     # from stack-and-mcp-selection
pipeline.json                 # toolchain manifest — every workflow reads it
.github/actions/setup-project/ # composite action that installs the declared toolchain
docs/                         # trimmed working copies from project-docs
docs/pipeline-log.md          # append-only audit log, seeded with the bootstrap entry
docs/demos/                   # empty, with a README explaining these are generated
.claude/skills/               # implement-story, pr-review, pr-fix, production-prep
.github/workflows/            # the full set — see the split-repo rule below
.github/scripts/              # complete-story, dispatch-next, watchdog, validate-stories,
                              #   read-manifest, write-env
e2e/                          # harness: demo.ts (browser) + demo-command.mjs (no UI)
playwright.config.ts          # includes the webServer block that serves the app in CI
scripts/sync-secrets.sh       # pushes .env values up to repo secrets
README.md
.gitignore                    # must include .env, .pipeline/, and the two graphify
                              #   dotfiles below — each as its OWN line, comment above
                              #   it, never trailing on the same line (gitignore does
                              #   not strip trailing "pattern  # comment"; only a line
                              #   starting with # is a comment, so anything after a
                              #   pattern on the same line becomes part of the pattern
                              #   and silently never matches)
.claude/settings.json         # graphify's PreToolUse hook — merge into an existing
                              #   file's "hooks" key rather than overwrite (see below)
graphify-out/                 # knowledge graph — graph.json, GRAPH_REPORT.md,
                              #   graph.html, manifest.json, cost.json, cache/ committed;
                              #   graphify-out/.graphify_python and .graphify_root
                              #   gitignored (machine-specific, re-resolved automatically)
```

**graphify — always wired in, both locally and in CI.** After assembling the file list
above (before the commit), run `/graphify .` on the freshly cloned repo, then
`graphify claude install`. This writes the `## graphify` section into `CLAUDE.md` and a
`PreToolUse` hook into `.claude/settings.json` — if `.claude/settings.json` already
exists (existing-repo path), merge the `hooks` key rather than overwrite. The install
step defaults the hook's command to this machine's absolute `graphify` binary path,
which no-ops (non-blocking, does not fail the build) on any other machine — including
every CI runner. Fix it to the bare command before committing:

```bash
sed -i 's#/[^"]*/graphify hook-guard#graphify hook-guard#' .claude/settings.json
```

Then add a `graphify` install step plus an incremental `graphify update .` (AST-only, no
LLM cost) to `.github/actions/setup-project/action.yml`, right after the manifest step —
this is what makes the CI-run agents (`story-start`, `pr-review`, `pr-fix`,
`production-prep`) resolve the hook and actually query the graph instead of grepping the
whole repo cold on every question, which is where most of this pipeline's token spend
happens:

```yaml
    - name: Install graphify
      shell: bash
      run: |
        set -euo pipefail
        if ! command -v graphify >/dev/null 2>&1; then
          if command -v uv >/dev/null 2>&1; then
            uv tool install --quiet graphifyy
          else
            pip install --quiet graphifyy --break-system-packages 2>/dev/null \
              || pip install --quiet --user graphifyy
          fi
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
        fi

    - name: Refresh graphify graph
      shell: bash
      run: |
        set -euo pipefail
        if [ -f graphify-out/graph.json ]; then
          export PATH="$HOME/.local/bin:$PATH"
          graphify update . || echo "::warning::graphify update failed — continuing with the existing graph."
        fi
```

No API key is needed for any of this — graphify extracts code structurally (AST, free)
and falls back to the host agent itself for docs/papers/images when no
`GEMINI_API_KEY`/`GOOGLE_API_KEY` is set. Never prompt the user for one.

Split-repo projects: graphify each repo separately — a non-spine repo's code benefits
the same way, and `graphify-out/` belongs in both the spine and non-spine file lists
below, not just the spine's.

**Split-repo rule: the pipeline lives in the spine repo only.** The spine gets
everything above. A non-spine repo gets `CLAUDE.md`, `.env.example`, `.mcp.json`,
its own `pipeline.json` (a split project's two repos rarely share a stack),
`docs/`, the `e2e/` harness, `scripts/`, `ci.yml`, and its own `graphify-out/` +
`.claude/settings.json` + the graphify install/update steps in `setup-project` — and
**none** of `story-start`, `pr-review`, `pr-fix`, `story-complete`, `production-prep`,
`pipeline-watchdog`, or `.github/scripts/`.

Every one of those reads `stories.json` off the filesystem, so a second copy would
either crash on a repo that does not carry the file or, worse, run a second dispatcher
against the same state and race the spine. One state file, one set of workflows, one
dispatcher.

If a story targets a non-spine repo, the spine's `implement-story` clones it and works
there; the PR opens on that repo and the spine's `story-complete` records it. Confirm
with the user that this is what they want before bootstrapping a split project — a
single repo is almost always the better answer, and `repos` exists for the case where
that has genuinely already been decided.

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

`sync-secrets.sh` covers app secrets only. The pipeline's own secrets —
`CLAUDE_CODE_OAUTH_TOKEN`, `PIPELINE_PAT`, and the optional `PIPELINE_WEBHOOK` and
`REVIEWER_TOKEN` — are set by hand with `gh secret set` and must not be added to
`.env.example`. Putting one there would sync it, but it would also commit its name to
the repo as an app variable and make `write-env.mjs` write it into `.env` on every
runner, which is not where any of them are read from.

`.env` itself is never committed. CI rebuilds it on each runner from repo secrets via
`.github/scripts/write-env.mjs`.

### 4. Verify the pipeline before trusting it

Run every check and report pass/fail. **Do not dispatch story 1 until all pass.**

- [ ] `CLAUDE_CODE_OAUTH_TOKEN` exists as a repo secret — generate it with `claude setup-token`
      (Pro or Max subscription; it is not an API key and needs no Console billing).
- [ ] `PIPELINE_PAT` exists as a repo secret — a PAT or GitHub App token with `repo` and
      `workflow` scope. **This is the failure everyone hits:** a workflow's own
      `GITHUB_TOKEN` cannot trigger another workflow, so without this the chain dies
      silently after story 1 with no error anywhere.
- [ ] Every key in `.env.example` exists in `gh secret list`
- [ ] `.env` is gitignored and absent from `git ls-files`
- [ ] Branch protection on `main`: require PR, require status checks, no force push
- [ ] **Auto-merge is enabled on the repo** —
      `gh api -X PATCH repos/<owner>/<repo> -F allow_auto_merge=true`. `implement-story`
      arms `gh pr merge --auto` on every PR, and that is the only thing that merges
      anything. Without it the pipeline approves story 1 and then waits forever.
- [ ] At least one required review or status check on `main` — auto-merge with nothing
      required merges the PR the instant it opens, before review runs at all
- [ ] `ci` is in the required status checks for `main`. It is the deterministic gate and
      the thing that stops auto-merge from firing before review runs
- [ ] `node .github/scripts/validate-stories.mjs` passes on the committed `stories.json`
- [ ] `node .github/scripts/read-manifest.mjs --print` shows the right toolchain. Every
      workflow reads `pipeline.json`; a wrong command there fails all of them identically
- [ ] A reviewer identity exists that is **not** `PIPELINE_PAT`: either leave
      `REVIEWER_TOKEN` unset and let the `github-actions` bot approve, or set it to a
      second PAT. GitHub refuses to let the account that opened a PR approve it, so
      sharing one token here deadlocks the pipeline on story 1
- [ ] `delete_branch_on_merge` is on —
      `gh api -X PATCH repos/<owner>/<repo> -F delete_branch_on_merge=true`. Nothing in
      the pipeline cleans up feature branches, and a 35-story project leaves 35 of them
- [ ] Labels exist: `agent-fix`, `needs-human`, `steering`
- [ ] The steering issue exists, labeled `steering`, pinned. Its body should say that
      commenting `pause` halts dispatch and `resume` restarts it
- [ ] `gh workflow run story-start.yml` dispatches without error. Check the run's
      status, not just that the `gh` command itself returned 0 — GitHub flags a workflow
      file's *first* run as potentially unsafe whenever it invokes a third-party action
      (every workflow here calls `anthropics/claude-code-action`), and holds it with
      zero jobs created: `gh run list` shows `completed` / `action_required`. This is a
      one-time gate per workflow file's content, not specific to this dispatch — a human
      with write access must open the run and click **Approve and run** once for each of
      `story-start`, `pr-review`, `pr-fix`, and `production-prep` before the chain can
      move at all. Because the job never starts, the story never gets marked in
      progress, so this failure mode looks like nothing happened rather than like an
      error — surface it explicitly in the handoff report rather than assuming a clean
      dispatch means the pipeline is actually running.
- [ ] `gh workflow list` shows all eight workflows registered: `ci`, `story-start`,
      `pr-review`, `pr-fix`, `story-complete`, `production-prep`, `pipeline-watchdog`,
      `notify`
- [ ] `gh workflow run pipeline-watchdog.yml -f dry_run=true` reports the pipeline as
      idle rather than erroring — this is the recovery path for a crashed run, and it
      is worth knowing it works before you need it
- [ ] `graphify-out/graph.json` and `.claude/settings.json` are committed, the hook
      command in `.claude/settings.json` is the bare `graphify hook-guard ...` (not an
      absolute path), and `setup-project` installs `graphify` — otherwise the CI-run
      agents silently fall back to grepping the repo cold on every question

### 5. Dry run

Dispatch `story-start` with `dry_run: true`. It should select story 1, print the plan,
and exit without writing. If selection picks the wrong story, the `dependsOn` graph is
wrong — fix `stories.json` before a real run.

### 6. Hand off

Report to the user: repos, first story, where the steering issue is, and how to follow
along from a phone (GitHub mobile, watch the repo, subscribe to `needs-human`).

Then dispatch `story-start` for real.
