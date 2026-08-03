---
name: project-intake
description: Run the clarification and idea-refinement interview that opens a new project, producing an approved intake document in the Obsidian vault. Use this skill whenever the user brings a new project idea, says they want to start/scope/spec a new app or service, or types /project-intake — even if they present the idea as already well-formed, since the point of the skill is to find what they have not thought about yet.
---

# Project Intake

Planning, step 1 of 5. Turns a rough project idea into an approved intake document.

## Non-negotiables

- **Never summarize the user's answers.** Append them verbatim. Summarizing is where load-bearing detail dies.
- **Never create directories in the vault.** Everything is flat in `~/Notes/` with a filename prefix and frontmatter tags.
- Interview in rounds. Do not dump twenty questions at once.

## Procedure

### 0. Scope check

Before the interview, confirm the project is one this pipeline can build: a web
application or HTTP service, or a CLI/library/job that can be proven by command output.

If it is a mobile app, a native desktop app, a game, firmware, or an ML training
pipeline, **stop and say so**. The pipeline's safety comes entirely from a per-story
proof that regenerates and re-runs on every later PR; where that proof needs a human
looking at a device, nothing downstream is safe. Better to say this in the first two
minutes than after a full documentation set.

See "What this is for" in the repo README for the full table.

### 1. Restate

Read back what you understood from their opening message in two or three sentences. Ask what is wrong with it. This is cheap and catches misreads before they compound through four more skills.

### 2. Round 1 — shape

Ask 3–5 questions covering:
- What is it, in one sentence a stranger would understand?
- Who uses it, and is it single-user, small-team, or public?
- What is the one thing that must work for this to be worth building?
- What already exists — repos, accounts, prior attempts, designs?

### 3. Round 2 — the exposed seams

Do not use a fixed list here. Read round 1's answers and go after whatever is load-bearing and vague. Typical targets: the data model implied but not stated, the integration they mentioned in passing, the scale assumption hiding in "for now."

Ask about failure explicitly: what happens when the external service is down, when input is malformed, when two things happen at once.

### 4. Round 3 — constraints sweep

Cover every one of these. They determine stack and stories:
- Hosting/deploy target, and whether an account already exists
- Budget ceiling, including whether paid tiers are acceptable
- Auth model and who is allowed to do what
- Data sensitivity — PII, credentials, anything regulated
- Third-party services already paid for or already in use
- Deadline or event this is tied to
- Whether the frontend and backend need separate repos (rare; ask, do not assume)

### 5. Gaps pass

Before writing, check the answers against `../story-breakdown/references/coverage.md`. Anything in that checklist you cannot answer from the interview is a question you have not asked. Ask it now — it is far cheaper here than as a missing story later.

### 6. Approval

Restate the whole project: what it is, what it does, what is explicitly out of scope, what constraints bind it. Ask for a yes. If not yes, loop back to whichever round was wrong.

Terminate on the yes, not on a question count.

## Output

Write `~/Notes/<project-slug>-intake.md`:

```markdown
---
project: <project-slug>
tags: [project/<project-slug>, type/intake, status/active]
created: <YYYY-MM-DD>
---

# <Project Name> — Intake

## Approved summary
<the restatement they said yes to>

## Out of scope
- ...

## Constraints
- ...

## Interview transcript
### Round 1
**Q:** ...
**A:** <verbatim>
```

Then tell the user the next step is `/stack-and-mcp-selection`.
