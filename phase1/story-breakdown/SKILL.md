---
name: story-breakdown
description: Decompose a documented project into an ordered, dependency-aware set of implementable user stories in stories.json, then run a coverage sweep to catch the infrastructure, CI/CD, security, and operational work that app-focused decomposition always misses. Use after project-docs, or whenever the user asks to break a project into stories, tickets, or a build plan, or types /story-breakdown.
---

# Story Breakdown

Phase 1, step 4 of 5. Produces `stories.json` — the state machine every Phase 2
workflow reads and writes.

## Two passes, both mandatory

Pass one builds the app. Pass two builds the *project*. Skipping pass two is the
single most expensive shortcut available in this pipeline, because the missing work
surfaces during production prep when it is 35 stories too late to sequence properly.

## Pass 1 — decomposition

Read `~/Notes/<slug>-tdd.md`, `-data-model.md`, `-api.md`, `-security.md`, `-infra.md`,
`-testing.md`.

Each story must be:

- **A vertical slice.** It touches whatever layers it needs and ends in something
  demonstrable. "Add the users table" is not a story; "sign in with a 6-digit code" is.
- **Independently demoable.** If you cannot describe a screenshot sequence or a command
  output that proves it works, it is not a story yet — either split it or fold it into
  a neighbour.
- **Sized to one PR.** If the acceptance criteria exceed roughly six items, split.
- **Dependency-explicit.** `dependsOn` carries ordering. Do not encode ordering in
  priority integers; a flat line cannot express two stories that could proceed in
  parallel, which matters for split frontend/backend repos.

Foundation stories come first and are exempt from "demoable via UI" — they get
command-output demos instead (provisioning, scaffolding, schema baselines).

Acceptance criteria are **product-specific only**. Do not write "typecheck passes" or
"verify in browser" into individual stories — those live once in `CLAUDE.md` as the
definition of done. Repeating process boilerplate across every story wastes context on
every single CI run.

## Pass 2 — coverage sweep

Read `references/coverage.md`. For **every** item, state one of:

- the story ID that covers it,
- a new story you are adding to cover it, or
- an explicit reason it does not apply to this project.

There is no fourth option. Silence here is the failure mode this pass exists to prevent.

Newly added stories usually sort to the front (CI, secrets, error handling) or the back
(rate limiting, observability). Wire their `dependsOn` properly rather than appending
them to the end of the list.

Show the user the sweep table before writing the file. This is the highest-value review
moment in Phase 1.

## Pass 3 — verification planning

For every story, fill `verification`:

- `commands` — typecheck/lint/build/unit commands that must pass
- `specs` — Playwright spec paths. **Mandatory for any story with a user-facing
  surface.** These specs generate the demo docs and constitute the regression suite;
  a UI story without one is invisible to every later review.
- `demo` — the demo doc path the spec generates

Foundation stories with no UI get `specs: []` and a `demoKind: "command"`.

## Output

Write `stories.json` to `/tmp/<slug>/stories.json`. Schema and a worked example are in
`references/stories-schema.md` — read it before writing.

Also write `~/Notes/<slug>-stories.md`, a human-readable mirror with the dependency
graph and the coverage sweep table, tagged `type/stories`.

Next step: `/repo-bootstrap`.
