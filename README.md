# Project Pipeline

An end-to-end build pipeline: you describe a project once, and it gets specced,
decomposed, built story by story, reviewed, fixed, and prepared for production —
with a generated demo per story that doubles as the regression suite.

## Install

```bash
git clone git@github.com:cwnaze/agentic-claude-workflow.git && cd agentic-claude-workflow
./install.sh --check     # verify prerequisites first
./install.sh             # or --link, if you plan to edit the skills
```

`install.sh --link` symlinks instead of copying, so edits here take effect immediately.
`--uninstall` removes them. Destination defaults to `~/.claude/skills`; override with
`CLAUDE_SKILLS_DIR`.

Prerequisites: `claude`, `gh` (authenticated), `git`, `node`, `jq`.

**Phase 2/3 is not installed globally.** `repo-bootstrap` copies `repo-template/` into
each project repo, so you can edit a project's pipeline without forking this one.

## Run

```
/project-intake            # interview → ~/Notes/<slug>-intake.md
/stack-and-mcp-selection   # stack + .mcp.json
/project-docs              # 6 docs, vault long-form + repo trimmed
/story-breakdown           # stories.json + coverage sweep
/repo-bootstrap            # commit scaffold, populate .env, verify pipeline, dispatch story 1
```

`project-docs` writes `.env.example` from the infrastructure doc. `repo-bootstrap` then
stops and waits: copy it to `.env`, fill in the values, and it runs
`scripts/sync-secrets.sh` to push them to repo secrets. CI rebuilds `.env` on each
runner from those secrets. `.env` is never committed.

Then it runs itself:

```
story-start → PR (auto-merge armed) → pr-review → issue → pr-fix ─┐
                                        ▲                          │
                                        └──────── synchronize ─────┘
                     approve → auto-merge → story-complete → next story
                                                       ↓ (no stories left)
                                                 production-prep

pipeline-watchdog (hourly) ──→ resumes or escalates a stalled run
```

## Required repo secrets

| Secret | Why |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Code in Actions |
| `PIPELINE_PAT` | PAT or App token, `repo` + `workflow`. **Without it the chain dies silently after story 1** — a workflow's own `GITHUB_TOKEN` cannot trigger another workflow. |
| `PIPELINE_WEBHOOK` | Optional. Slack/Discord/ntfy URL; `notify` posts there when anything gets labeled `needs-human`. Unset, the job no-ops. |

Plus every key in the project's `.env.example` — `scripts/sync-secrets.sh` handles those.

Auto-merge must also be enabled on the repo (`allow_auto_merge`), with at least one
required review or status check on `main`. `implement-story` arms `gh pr merge --auto`
on every PR and that is the only thing that merges anything; `repo-bootstrap` checks
both before dispatching story 1.

## Controlling it from a phone

No UI needed. The pinned `steering` issue is the input channel — comment on it and
`implement-story` and `pr-fix` read it as binding constraints on their next run.
Comment on a PR directly to feed the fix loop.

A comment that is exactly `pause` halts all dispatch; `resume` restarts it. The most
recent directive wins, and prose *about* pausing does not count — the line has to be
just the word, so discussion on the issue can't stop the pipeline by accident. This is
also the kill switch.

Set `PIPELINE_WEBHOOK` to get pushed alerts when something needs you; otherwise watch
the `needs-human` label.

## Files

```
install.sh
phase1/
  project-intake/            stack-and-mcp-selection/   (+ references/mcp-map.md)
  project-docs/              story-breakdown/           (+ references/coverage.md,
  repo-bootstrap/                                          references/stories-schema.md)
repo-template/
  .claude/skills/{implement-story,pr-review,pr-fix,production-prep}/
  .github/workflows/{story-start,pr-review,pr-fix,story-complete,production-prep}.yml
  .github/workflows/{pipeline-watchdog,notify}.yml
  .github/scripts/{complete-story,dispatch-next,watchdog,write-env}.mjs
  e2e/{demo.ts,example.spec.ts}   playwright.config.ts
  scripts/sync-secrets.sh         .env.example
  CLAUDE.md  README.md  stories.example.json  docs/{pipeline-log.md,demos/README.md}
```

## Design notes

**Why not an orchestrator.** Every Phase 2 transition is already a native GitHub event
and the only durable state is `stories.json` in the repo. An external orchestrator would
add a hop, an uptime requirement, and a second copy of state. Phase 1 is local because
it needs a conversation and the Obsidian vault; everything after `git push` is not.

**Why demos are generated, not written.** A markdown demo doc is a point-in-time claim
that cannot fail. A spec that generates one can. `pr-review` re-runs every done story's
spec, so all demos are re-verified on every PR and stale screenshots become a visual
regression signal.

**Why the review is one agent, not a fan-out.** On a single-story diff a fan-out costs
several times more and yields overlapping findings the fix agent must then reconcile.
`production-prep` *is* a fan-out, because it is whole-repo and its passes are genuinely
independent.

**Why there is a watchdog, given there is no orchestrator.** Event-driven means an
event that never fires is indistinguishable from nothing to do. A runner eviction, an
API 5xx, or a job timeout leaves a story non-terminal with no further event coming, and
the pipeline stops mid-story, silently, forever. `pipeline-watchdog` is the one
time-triggered thing in the repo: hourly, it looks for a story that is non-terminal
while no workflow is running and `stories.json` has not moved in 90 minutes, then
re-dispatches (`implement-story` already knows how to resume one) or escalates. It is
not an orchestrator — it holds no state and makes no decisions the normal path doesn't.

**Why dispatch goes through one script.** `dispatch-next.mjs` is the only thing that
dispatches, so the pause switch, the stuck-story check, and the daily run ceiling cannot
be bypassed by a caller that forgot them. The ceiling matters because `--max-turns`
bounds a single run and nothing bounded the total: a review/fix cycle that never
converges, or a watchdog retrying something permanently broken, otherwise bills all the
way down with no alert.

**Why the loop terminates at 3 rounds.** Review → fix → review will cycle indefinitely
on anything the reviewer is subtly wrong about. Round 3 hard-stops to `needs-human`.

**Local services are optional.** The workflows run `docker compose up --wait` only if the
project has a compose file. Hosted-SaaS projects — Turso, Resend, R2 and friends — need
nothing there; CI reaches them with the same credentials you put in `.env`.

**Known costs.** Real third-party credentials live in repo secrets, which means CI runs
against live services unless the project provides local substitutes. Screenshot-heavy
specs are slower and flakier than assertions;
the determinism rules in `playwright.config.ts` and `implement-story` exist to contain
that, and they are not optional.
