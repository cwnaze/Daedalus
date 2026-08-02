# <Project Name>

<!-- Written by repo-bootstrap. Agents read this on every run — keep it dense. -->

## What this is
<one paragraph from the approved intake summary>

## Stack
<table from ~/Notes/<slug>-stack.md>

## Version warnings
<!-- Libraries where training data is stale and no MCP server covers it.
     Be specific about the wrong pattern, not just the right one. -->
- Svelte 5: use runes (`$state`, `$derived`, `$effect`). Do NOT use `writable`/`$:`.
- Tailwind v4: config lives in CSS via `@theme`. There is no `tailwind.config.js`.

## Definition of done
Applies to every story. Do not restate these in individual acceptance criteria.
- typecheck passes
- lint passes
- build succeeds
- the story's demo spec passes and regenerates `docs/demos/<ID>.md`
- every previously passing demo spec still passes

## Conventions
- Validate every external input at the boundary. No exceptions for internal callers.
- Authorization is enforced server-side. Client-side checks are UX, never security.
- No secrets in source or logs. Everything through env vars, documented in `.env.example`.
- Errors surface to the user meaningfully. A blank screen is a bug.
- Demo spec titles start with the story ID: `US-H01: compose and send`.

## Pipeline
`stories.json` is the source of truth. Only workflows mutate it, only on `main`, one
commit per transition, paired with a `docs/pipeline-log.md` line in the same commit.

The `steering` issue carries live instructions from the project owner. Read open
comments before implementing or fixing; treat them as binding.

## Local development
```bash
docker compose up -d
npm install
npm run dev
npx playwright test
```
