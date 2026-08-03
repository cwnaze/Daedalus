---
name: project-docs
description: Generate the full technical documentation set for a new project — design, data model, API, security, infrastructure, testing strategy — writing long-form versions into the Obsidian vault and trimmed working versions into the repo. Use after stack-and-mcp-selection, or whenever the user asks for technical design docs, a TDD, or types /project-docs.
---

# Project Docs

Phase 1, step 3 of 5. Fans documentation generation out to subagents so the
orchestrating session never holds every document at once.

## Non-negotiables

- **No directories in the vault.** Flat files, `<project-slug>-<doc>.md`, tags do the grouping.
- **Every document is written twice.** Long-form to `~/Notes/`, trimmed to `/tmp/<slug>/docs/`.
  The vault version is for the human. The repo version is loaded into agent context on
  every CI run — bloat there is paid for 35 times over.
- **Subagents return a file path and nothing else.** Not a summary, not the content.
  This is the entire context-efficiency mechanism; violating it defeats the skill.

## Procedure

### 1. Read inputs

**Greenfield:** `~/Notes/<slug>-intake.md` and `~/Notes/<slug>-stack.md`. Both must exist.

**Brownfield** (an existing codebase): `~/Notes/<slug>-inventory.md` and
`~/Notes/<slug>-refactor-intake.md` instead. If those exist, you are in brownfield mode
and the rule below governs everything that follows.

**In brownfield mode the docs are derived, not designed.** The data model is whatever
the schema says, the API surface is whatever the routes expose, the security model is
whatever the code actually enforces. Subagents must read the code and write down what is
there — including the parts that are wrong.

This is the opposite of the greenfield instinct and it is the whole point: a document
describing the system you wish you had is worse than no document, because every later
agent trusts it and reports the difference as *their* mistake. Record what exists;
`refactor-intake` already says what is changing.

Mark each document's sections as `current` or `target`, and for `target` cite the
refactor-intake line that authorized the change. A target with no citation is a design
you invented — delete it.

### 2. Dispatch subagents in parallel

One subagent per document. Give each: the intake path, the stack path, the document
spec below, and both output paths. Instruct each to read its inputs from disk rather
than receiving them inline.

| Document | Vault file | Covers |
|---|---|---|
| Technical design | `<slug>-tdd.md` | Architecture, component boundaries, request flow, key decisions with rationale, rejected alternatives |
| Data model | `<slug>-data-model.md` | Entities, fields with types, relationships, indexes, migration strategy, seed data |
| API surface | `<slug>-api.md` | Every endpoint/route: method, path, auth requirement, request shape, response shape, error cases |
| Security model | `<slug>-security.md` | Authn mechanism, authz rules per resource, secret handling, input validation boundaries, threat notes |
| Infrastructure | `<slug>-infra.md` | Environments, deploy pipeline, env vars with purpose, external services, rollback plan |
| Testing strategy | `<slug>-testing.md` | What gets a Playwright demo spec vs. a unit test, seed data approach, determinism rules, what "no regressions" concretely means here |

Frontmatter on every vault file:

```yaml
---
project: <slug>
tags: [project/<slug>, type/<doc-type>, status/active]
created: <YYYY-MM-DD>
---
```

### 3. Trim for the repo

The repo copy keeps: schemas, endpoint tables, env var lists, authz rules, conventions.
It drops: rationale, rejected alternatives, background prose, anything an agent will not
act on. Target roughly a third the length.

### 4. Generate `.env.example`

The infrastructure doc knows every environment variable the project needs; write that
knowledge into a machine-usable form at `/tmp/<slug>/.env.example`:

```
# Copy to .env, populate, then run: ./scripts/sync-secrets.sh
DATABASE_URL=            # libSQL connection string, from the Turso dashboard
DATABASE_AUTH_TOKEN=     # turso db tokens create <name>
APP_BASE_URL=            # http://localhost:5173 locally
```

Every variable gets a trailing comment saying **where the user obtains the value** — not
what it is. "From the Turso dashboard" is useful; "the database URL" is not.

This file is the contract in both directions: `scripts/sync-secrets.sh` reads it to
decide what to push to GitHub secrets, and CI reads it to materialize `.env` back onto
the runner. A variable omitted here is a variable CI will silently lack, so cross-check
it against every service named in the stack and infra docs before moving on.

### 5. Consistency pass

Read only the repo copies (they are short — this is why they exist). Check that:
- The data model's entities match the API's payloads
- The security model's authz rules cover every endpoint in the API doc
- The infra doc's env vars cover everything the other docs reference, and `.env.example` covers all of those
- The testing doc's approach is actually achievable on the chosen host

Fix contradictions now. A contradiction here becomes 35 stories of drift.

### 6. Report

List the vault files written, the env variables the user will need to obtain values for, and any open questions the docs could not resolve.
Open questions go back to the user before `/story-breakdown` runs.
