---
name: codebase-inventory
description: Survey an existing codebase and produce the inventory, toolchain manifest, and behavioural map that the brownfield pipeline needs — what the project is, how it builds, what it does, and what is already tested. Use as the first step for any existing project, or whenever the user wants to refactor, modernize, extend, or bring an existing repo under the pipeline, or types /codebase-inventory.
---

# Codebase Inventory

Phase 1, step 1 of 5 for an **existing** project. The brownfield counterpart to
`project-intake`: where that interviews the user about an idea, this reads the code.

The distinction matters because on a brownfield project the answers already exist. The
data model is in the schema, the API surface is in the routes, the conventions are in
the code. Asking the user to describe them produces a description that is subtly wrong
in ways nobody notices until 20 stories in.

## Non-negotiables

- **Read before asking.** Every question you put to the user must be one the repository
  cannot answer. "What database is this?" is answerable; "which of these two patterns do
  you want to keep?" is not.
- **Describe what is, not what should be.** This step is a survey. Judgements about what
  is wrong belong in `refactor-intake`, and mixing them in here produces an inventory
  that quietly editorializes.
- **Never modify the repository.** No formatting, no dependency installs, no fixes,
  however tempting. This step is read-only and the user has not agreed to anything yet.

## Procedure

### 0. Scope check

The detector reports what kind of project this is. If it turns out to be a mobile app, a
native desktop app, a game, firmware, or an ML training pipeline, stop and say so — the
pipeline cannot generate a per-story proof for those, and without that proof the
refactor has no safety net. See "What this is for" in the repo README.

A project with no web surface is fine; it uses command demos. A project whose behaviour
cannot be demonstrated automatically at all is not.

### 1. Detect the toolchain

```bash
node <skill-dir>/detect-stack.mjs <repo> --report
```

It reads the ecosystem's own marker files and proposes a `pipeline.json`. It also prints
what it could **not** determine — treat that list as your question queue, and do not fill
those fields by guessing. A wrong build command fails every CI run identically and is
tedious to trace back to this moment.

Confirm the proposal with the user before continuing. Specifically confirm anything the
report flagged: multiple runtimes, a Makefile that may be the real entry point, or a
missing test script.

### 2. Establish scale

Cheap, and it sets expectations for everything downstream:

```bash
git ls-files | wc -l
git ls-files | sed 's/.*\.//' | sort | uniq -c | sort -rn | head
git log --oneline | wc -l
git log -1 --format=%cI
git shortlog -sn --all | head
```

A repo with 40 files and one contributor is a different proposition from 4,000 files and
twelve. Note which, because it changes how large a refactor story can safely be.

### 3. Map the surface

Find, by reading rather than assuming — the specifics differ per stack, so search for
the shapes rather than for known filenames:

- **Entry points** — what starts. Servers, CLIs, workers, scheduled jobs.
- **Routes/endpoints** — the external surface. This becomes the API doc.
- **Data model** — schema files, migrations, ORM models. This becomes the data model doc.
- **External dependencies** — every network call, every third-party SDK, every env var
  actually referenced in code. Cross-check against any committed `.env.example`; drift
  between the two is common and load-bearing.
- **Auth** — how identity is established and where authorization is enforced.
- **Existing tests** — what they cover, whether they currently pass, and how long they take.

### 4. Run the build

Actually run the detected install, build, and test commands. Report exactly what happened.

This is the single most valuable output of the inventory. A refactor plan written against
a build the author never ran is a plan built on a guess, and "the tests already fail on
`main`" changes the entire sequencing — you cannot use a red suite as a safety net.

If the build fails, do not fix it. Record it. Fixing the build is a story.

### 5. Identify the risk surface

For each area, note what makes changing it dangerous — no tests, unclear ownership,
external callers, data migrations, anything with money or credentials in it. This drives
which characterization specs get written first in `story-breakdown`.

### 6. Write the inventory

`~/Notes/<slug>-inventory.md`, frontmatter `tags: [project/<slug>, type/inventory, status/active]`:

```markdown
# <Project> — Inventory

## Toolchain
<the confirmed pipeline.json, and how it was determined>

## Scale
<file count, languages, commit count, last activity, contributors>

## Entry points
## External surface
<routes/endpoints/commands>
## Data model
## External dependencies
<services, SDKs, env vars actually referenced>
## Auth model
## Existing tests
<what exists, whether it passes, runtime>

## Build status
<verbatim result of running install/build/test>

## Risk surface
<area → why changing it is dangerous>

## Open questions
<things the code genuinely could not answer>
```

Stage the confirmed manifest at `/tmp/<slug>/pipeline.json`.

## Output

The inventory document, the staged `pipeline.json`, and a spoken summary of the build
status and the top three risk areas.

Next step: `/refactor-intake`.
