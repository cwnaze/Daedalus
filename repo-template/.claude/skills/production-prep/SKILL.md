---
name: production-prep
description: Run the whole-repo production readiness pass after every story is done — security audit, code health, operational readiness, and full verification — producing a readiness report and turning must-fix findings into new stories. Invoked by the production-prep workflow, or when the user asks to prepare a project for production or launch.
---

# Production Prep

Phase 3. **This one is a fan-out**, unlike `pr-review` — the passes are independent and
whole-repo rather than diff-scoped, so parallel subagents are the right shape here.

Runs on branch `chore/production-prep`.

## 1. Confirm eligibility

Every story `done`. If any is `needs_human` or `blocked`, stop and report — production
prep on an incomplete build produces findings that the outstanding stories would have
fixed anyway.

## 2. Fan out

Four subagents, each returning a findings file path only.

**Security** — `gh api` dependency alerts and the ecosystem's own audit tool
(`npm audit`, `pip-audit`, `govulncheck`, `cargo audit`, `bundle audit` — match
`pipeline.json`'s runtime); secret scan across **full git
history**, not just the tree; authz check on every endpoint against `docs/*-security.md`;
input validation at every boundary; rate limiting on public and expensive endpoints;
security headers and CORS; and specifically re-examine anything a per-story review waved
through as acceptable for now.

**Code health** — dead code and unreachable branches; logic duplicated across stories
that only became visible once all of them landed; inconsistent error handling; remaining
`TODO`/`FIXME`; and architectural drift, where a late story solved a problem differently
than an early one. That last item is the highest-value finding in this pass and the one
per-story review structurally cannot catch.

**Operational readiness** — structured logging with correlation IDs; health check;
graceful shutdown; migration rollback actually tested, not just written; every env var
documented in `.env.example`; backup/restore story; failure behaviour when each external
service is down.

**Documentation and DX** — README setup/run/test/deploy accurate from a clean clone;
architecture docs match what was built; demo docs all regenerate.

## 3. Full verification

Every spec, clean. Production build. Deploy to staging and smoke test there. A green
suite against dev services is not evidence about production.

## 4. Report

`docs/production-readiness.md`, and the same content to `~/Notes/<slug>-prod-readiness.md`
if the vault is reachable (it usually is not, from CI — the repo copy is authoritative):

```markdown
## Must fix before launch
## Should fix soon
## Accepted, with rationale
```

## 5. Feed must-fix back into the loop

Append every must-fix finding to `stories.json` as a new story with `dependsOn: []` and
`status: pending`. They go through branches, PRs, and review like everything else.

**Commit that to `main` directly, not to this branch**, in its own commit with a
`docs/pipeline-log.md` line — the same rule every other transition follows. `stories.json`
is only ever read from `main`; new stories left on `chore/production-prep` are invisible
to the dispatcher, which then sees an all-done board and re-dispatches production-prep,
which appends them again. That loop is the reason this is a hard rule and not a
preference.

Then dispatch via `node .github/scripts/dispatch-next.mjs`. Do not call
`gh api ... dispatches` yourself: that script is where the pause switch, the stuck-story
check, and the run ceiling live.

Do not hand-fix them in this branch. The loop exists precisely so that late-discovered
work gets the same verification as everything else — bypassing it here is how the most
security-sensitive changes end up the least reviewed.

## 6. PR and hard stop

Open a PR for the report and any doc corrections. Label `needs-human`.

**Human review is required before this merges**, regardless of how clean it looks. Do
not approve, do not merge, do not dispatch anything further.
