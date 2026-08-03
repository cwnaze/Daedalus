---
name: refactor-intake
description: Turn a stated intent to refactor, modernize, or extend an existing project into an approved, bounded plan — what changes, what must not change, and how "still works" will be proven. Use after codebase-inventory, or whenever the user wants to plan changes to an existing codebase, or types /refactor-intake.
---

# Refactor Intake

Phase 1, step 2 of 5 for an existing project. The brownfield counterpart to the
constraints half of `project-intake`.

Greenfield intake asks what to build. Here that is already decided — the code exists.
The questions that matter are the opposite ones: what must **not** change, and how will
anyone know if it did.

## Non-negotiables

- **Read `~/Notes/<slug>-inventory.md` first.** If it does not exist, run
  `/codebase-inventory`. Planning a refactor without having run the build is planning
  against a guess.
- **Never summarize the user's answers.** Append verbatim.
- **Behaviour preservation is the default.** Every intentional behaviour change must be
  named explicitly. Anything not named is a regression, and that is the contract the
  whole pipeline enforces on itself.

## Procedure

### 1. Restate the current state

Two or three sentences from the inventory: what this is, what shape it is in, what the
build does today. Ask what is wrong with that reading. Misreadings caught here are free.

### 2. Round 1 — motivation

- What is painful right now? Ask for a recent concrete instance, not a category.
- What triggered doing this now?
- What does "done" look like — what will be true afterwards that is not true today?
- What have you already tried?

Push for specifics. "It's a mess" is a feeling; "adding a field means touching six files
and I always miss one" is a target that can be decomposed and verified.

### 3. Round 2 — boundaries

The most important round, and the one greenfield intake has no equivalent for:

- **What must not change?** Public APIs, URLs, database schema, CLI flags, output
  formats, anything with an external consumer.
- **Who or what depends on this?** Other services, scheduled jobs, humans with
  bookmarks, mobile clients you cannot update in lockstep.
- **What behaviour changes are intended?** Name each one. These become explicit stories.
- **What is out of scope entirely?** Areas not to touch even if they look wrong.
- **Is it deployed and in use?** Who notices if it breaks, and how quickly?
- **Is there a rollback path**, and has it been used?

### 4. Round 3 — verification

How will "it still works" be proven? Work from the inventory's test findings:

- If a suite exists and passes, it is the starting net. What does it *not* cover?
- If it does not exist or does not pass, characterization specs are the entire net, and
  writing them is the first several stories. Say this plainly — it is the main reason a
  refactor takes longer than it looks.
- Which flows would be most damaging to break silently? Those get specs first.
- Is there a staging environment, or production traffic to compare against?

### 5. Round 4 — sequencing constraints

- Must this ship incrementally, or can it land as one large change?
- Are there freeze windows, releases, or events to avoid?
- Is a rewrite acceptable for any part, or is everything strictly incremental?
- Budget ceiling for the whole effort.

### 6. Gaps pass

Check the answers against `../story-breakdown/references/coverage.md`, reading it as
"which of these does the project already have, and is that verified or assumed?" On a
brownfield project most items exist in some form; the interesting answer is the one
where the user is not sure.

### 7. Approval

Restate: the goal, the invariants, the intended behaviour changes, what is out of scope,
how verification works, and the sequencing constraints. Ask for a yes.

If the honest answer is that the refactor is riskier than the pain justifies, say so
here. That is a legitimate outcome of this step.

## Output

`~/Notes/<slug>-refactor-intake.md`, frontmatter
`tags: [project/<slug>, type/refactor-intake, status/active]`:

```markdown
# <Project> — Refactor Intake

## Approved goal
## Invariants — must not change
## Intended behaviour changes
## Out of scope
## Dependents and blast radius
## Verification strategy
## Sequencing constraints
## Interview transcript
```

Next step: `/project-docs` in brownfield mode — it derives the docs from the code rather
than inventing them, using this document to mark what is changing.
